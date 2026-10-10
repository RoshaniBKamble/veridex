"""Drift engine: expected-vs-observed comparison, drift events, permission observations and incidents."""
import os
from datetime import datetime, timedelta, timezone

from .chains import AUTHORITY_FIELDS, NETWORKS, observe
from .core import audit, db, new_id, next_seq, now
from .crypto import canonicalize, hash_obj, verify_signature

SEVERITY = {
    "chain_id": "CRITICAL", "cluster": "CRITICAL", "code_hash": "CRITICAL", "implementation": "CRITICAL",
    "implementation_code_hash": "CRITICAL", "upgrade_authority": "CRITICAL", "release_attestation": "CRITICAL",
    "proxy_admin": "HIGH", "owner": "HIGH", "last_deploy_slot": "HIGH", "executable": "HIGH", "loader": "HIGH",
    "program_data_address": "MEDIUM",
}
WHY = {
    "chain_id": "The contract is being observed on a different network than the one approved.",
    "cluster": "The program is being observed on a different Solana cluster than the one approved.",
    "code_hash": "Runtime bytecode at the approved address differs from the approved bytecode.",
    "implementation": "The proxy now delegates to a different implementation contract than the one approved. Logic executed by users has changed.",
    "implementation_code_hash": "The bytecode executed behind the proxy differs from the approved artifact.",
    "proxy_admin": "The address able to upgrade the proxy changed. Whoever controls it can replace contract logic.",
    "owner": "The privileged owner() address changed. Owner-gated functions are now controlled by a different key.",
    "upgrade_authority": "The Solana program upgrade authority changed. That key can redeploy program code.",
    "last_deploy_slot": "The program was redeployed after the approved deployment slot.",
    "executable": "The program account's executable flag differs from the approved state.",
    "loader": "The program is owned by a different loader than approved.",
    "program_data_address": "The ProgramData account for this program differs from the approved record.",
    "release_attestation": "The approved release attestation no longer verifies against stored evidence.",
}
NEXT = {
    "CRITICAL": "Freeze further releases, confirm with the signers of the privileged keys whether this change was authorised, and compare the observed artifact against the approved evidence.",
    "HIGH": "Confirm the change against your change-management records and the multisig transaction history before re-baselining.",
    "MEDIUM": "Review the change and re-baseline the expected state if it was intended.",
}
TRANSITIONS = {
    "OPEN": {"ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"},
    "ACKNOWLEDGED": {"INVESTIGATING", "RESOLVED"},
    "INVESTIGATING": {"RESOLVED", "ACKNOWLEDGED"},
    "RESOLVED": set(),
}
SEV_RANK = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 0}


def stale_minutes() -> int:
    return int(os.environ["STALE_AFTER_MINUTES"])


def freshness(dep: dict) -> str:
    ts = dep.get("last_observed_at")
    if not ts:
        return "NEVER"
    age = datetime.now(timezone.utc) - datetime.fromisoformat(ts)
    return "STALE" if age > timedelta(minutes=stale_minutes()) else "FRESH"


def _norm(v):
    return v.lower() if isinstance(v, str) and v.startswith("0x") else v


async def verify_attestation(att: dict) -> dict:
    """Recompute the statement hash, verify Ed25519 signature, and re-check every referenced evidence hash."""
    stmt_ok = hash_obj(att["statement"]) == att["statement_hash"]
    sig_ok = verify_signature(att["public_key"], canonicalize(att["statement"]), att["signature"])
    ev_results = []
    for ref in att["statement"]["evidence"]:
        ev = await db.evidence.find_one({"_id": ref["id"]})
        current = hash_obj(ev["payload"]) if ev else None
        ev_results.append({"id": ref["id"], "type": ref["type"], "attested_hash": ref["hash"],
                           "recomputed_hash": current, "ok": current == ref["hash"]})
    ok = stmt_ok and sig_ok and all(e["ok"] for e in ev_results)
    return {"valid": ok, "statement_hash_ok": stmt_ok, "signature_ok": sig_ok, "evidence": ev_results,
            "anchor": att.get("anchor_status"), "checked_at": now()}


def compare(expected: dict, obs: dict) -> list:
    results = []
    for field, exp in expected.items():
        if exp is None:
            continue
        o = obs["fields"].get(field)
        base = {"field": field, "expected": exp, "severity": "INFO", "why": WHY.get(field, ""),
                "detected_at": now(), "source": o["source"] if o else None}
        if obs["mode"] == "UNAVAILABLE":
            results.append({**base, "observed": None, "status": "UNAVAILABLE",
                            "difference": "No observation", "limitation": obs.get("error") or "RPC unavailable",
                            "next_action": "Restore RPC connectivity and re-run verification. This is not evidence of drift."})
        elif not o or o["status"] == "UNSUPPORTED":
            results.append({**base, "observed": None, "status": "UNSUPPORTED", "difference": "Not observable",
                            "limitation": (o or {}).get("source") or "Adapter cannot observe this field",
                            "next_action": "Provide this value as verified configuration or remove it from expected state."})
        elif _norm(o["value"]) == _norm(exp):
            results.append({**base, "observed": o["value"], "status": "MATCH", "difference": None,
                            "limitation": None, "next_action": None})
        else:
            sev = SEVERITY.get(field, "MEDIUM")
            results.append({**base, "observed": o["value"], "status": "MISMATCH", "severity": sev,
                            "difference": f"{exp} → {o['value']}",
                            "limitation": "Simulated demo state" if obs["mode"] == "SIMULATED" else None,
                            "next_action": NEXT.get(sev, NEXT["MEDIUM"])})
    return results


def overall(results: list, mode: str) -> str:
    if mode == "UNAVAILABLE":
        return "UNAVAILABLE"
    if any(r["status"] == "MISMATCH" for r in results):
        return "DRIFT"
    if results and all(r["status"] == "MATCH" for r in results):
        return "VERIFIED"
    return "PARTIAL"


async def _attestation_check(dep: dict):
    att = await db.attestations.find_one({"release_id": dep["release_id"]})
    if not att:
        return {"field": "release_attestation", "expected": "valid attestation", "observed": "none",
                "status": "UNSUPPORTED", "severity": "INFO", "why": "Deployed release has no attestation.",
                "detected_at": now(), "source": "VERIDEX attestation store", "difference": "Release not attested",
                "limitation": "Attest the release to enable this check", "next_action": "Approve and attest the release."}
    v = await verify_attestation(att)
    st = "MATCH" if v["valid"] else "MISMATCH"
    return {"field": "release_attestation", "expected": att["statement_hash"],
            "observed": att["statement_hash"] if v["valid"] else "verification failed", "status": st,
            "severity": "INFO" if v["valid"] else "CRITICAL", "why": WHY["release_attestation"],
            "detected_at": now(), "source": f"Ed25519 verify {att['key_id']} + evidence re-hash",
            "difference": None if v["valid"] else "Evidence hash or signature no longer verifies",
            "limitation": "Offchain signed attestation (not anchored onchain)",
            "next_action": None if v["valid"] else "Inspect failed evidence items; treat the release as untrusted until re-approved."}


async def _record_permissions(dep, obs, observation_id):
    for field in AUTHORITY_FIELDS:
        o = obs["fields"].get(field)
        if not o or o["status"] != "OBSERVED":
            continue
        last = await db.permission_observations.find_one({"deployment_id": dep["_id"], "field": field},
                                                         sort=[("observed_at", -1)])
        if last and last["value"] == o["value"]:
            await db.permission_observations.update_one({"_id": last["_id"]}, {"$set": {"last_confirmed_at": now()}})
            continue
        await db.permission_observations.insert_one({
            "_id": new_id("prm"), "project_id": dep["project_id"], "deployment_id": dep["_id"],
            "network": dep["network"], "field": field, "value": o["value"],
            "previous": last["value"] if last else None, "changed": bool(last),
            "expected": dep["expected"]["fields"].get(field), "source": o["source"],
            "verification": "SIMULATED" if obs["mode"] == "SIMULATED" else "OBSERVED_ONCHAIN",
            "observation_id": observation_id, "observed_at": now(), "last_confirmed_at": now(),
            "review_status": "REVIEW_REQUIRED" if last else "BASELINE",
        })


async def _drift_and_incident(dep, results, observation_id, mode, actor):
    mism = [r for r in results if r["status"] == "MISMATCH"]
    if not mism:
        return None
    event_ids = []
    for r in mism:
        key = f"{dep['_id']}:{r['field']}:{r['observed']}"
        ex = await db.drift_events.find_one({"dedup_key": key, "status": "OPEN"})
        if ex:
            await db.drift_events.update_one({"_id": ex["_id"]}, {"$set": {"last_seen_at": now()},
                                                                  "$inc": {"occurrences": 1}})
            event_ids.append(ex["_id"])
            continue
        eid = new_id("drf")
        await db.drift_events.insert_one({
            "_id": eid, "dedup_key": key, "project_id": dep["project_id"], "deployment_id": dep["_id"],
            "release_id": dep["release_id"], "network": dep["network"], "field": r["field"],
            "expected": r["expected"], "observed": r["observed"], "severity": r["severity"], "why": r["why"],
            "source": r["source"], "observation_id": observation_id, "simulated": mode == "SIMULATED",
            "expected_version": dep["expected"]["version"], "status": "OPEN", "occurrences": 1,
            "detected_at": now(), "last_seen_at": now(), "next_action": r["next_action"],
        })
        event_ids.append(eid)
    qualifying = [r for r in mism if r["severity"] in ("CRITICAL", "HIGH")]
    if not qualifying:
        return None
    sev = max((r["severity"] for r in qualifying), key=lambda s: SEV_RANK[s])
    inc = await db.incidents.find_one({"deployment_id": dep["_id"], "status": {"$ne": "RESOLVED"}})
    fields = ", ".join(r["field"] for r in qualifying)
    if inc:
        new = [e for e in event_ids if e not in inc["drift_event_ids"]]
        if new:
            await db.incidents.update_one({"_id": inc["_id"]}, {
                "$addToSet": {"drift_event_ids": {"$each": new}},
                "$push": {"timeline": {"at": now(), "actor": "drift-engine", "type": "DRIFT_APPENDED",
                                       "note": f"Additional drift detected: {fields}"}}})
        return inc["_id"]
    num = await next_seq("incident")
    att = await db.attestations.find_one({"release_id": dep["release_id"]})
    release = await db.releases.find_one({"_id": dep["release_id"]})
    iid = new_id("inc")
    await db.incidents.insert_one({
        "_id": iid, "number": f"INC-{1000 + num}", "project_id": dep["project_id"], "deployment_id": dep["_id"],
        "release_id": dep["release_id"], "attestation_id": att["_id"] if att else None,
        "evidence_ids": [e["id"] for e in att["statement"]["evidence"]] if att else release.get("evidence_ids", []),
        "drift_event_ids": event_ids, "observation_id": observation_id, "severity": sev,
        "title": f"{'CRITICAL PRODUCTION DRIFT' if sev == 'CRITICAL' else 'Production drift'} — {dep['label']}",
        "summary": f"Production no longer matches the approved state for release {release['version']} on "
                   f"{NETWORKS[dep['network']]['name']}. Mismatched: {fields}.",
        "simulated": mode == "SIMULATED", "status": "OPEN", "created_at": now(), "updated_at": now(),
        "timeline": [{"at": now(), "actor": "drift-engine", "type": "CREATED",
                      "note": f"Auto-created from {len(event_ids)} drift event(s): {fields}"}],
    })
    await audit(dep["project_id"], actor, "incident.created", "incident", iid, {"severity": sev})
    return iid


async def verify_deployment(dep: dict, actor: str) -> dict:
    obs = await observe(dep)
    oid = new_id("obs")
    await db.observations.insert_one({"_id": oid, "deployment_id": dep["_id"], "project_id": dep["project_id"],
                                      "network": dep["network"], "observed_at": now(), **obs})
    results = compare(dep["expected"]["fields"], obs)
    results.append(await _attestation_check(dep))
    status = overall(results, obs["mode"])
    upd = {"verification_status": status, "comparisons": results, "last_check_at": now(),
           "last_observation_id": oid, "observation_mode": obs["mode"], "last_error": obs.get("error")}
    if obs["mode"] != "UNAVAILABLE":
        upd["last_observed_at"] = now()
        upd["last_block_ref"] = obs["block_ref"]
        await _record_permissions(dep, obs, oid)
    await db.deployments.update_one({"_id": dep["_id"]}, {"$set": upd})
    dep = {**dep, **upd}
    incident_id = await _drift_and_incident(dep, results, oid, obs["mode"], actor)
    await audit(dep["project_id"], actor, "deployment.verified", "deployment", dep["_id"],
                {"status": status, "mode": obs["mode"], "incident_id": incident_id})
    return {"deployment_id": dep["_id"], "status": status, "mode": obs["mode"], "observation_id": oid,
            "incident_id": incident_id, "comparisons": results, "error": obs.get("error")}


def baseline_from_observation(obs: dict, network_id: str) -> dict:
    fam = NETWORKS[network_id]["family"]
    keys = ["cluster", "executable", "loader", "program_data_address", "upgrade_authority", "last_deploy_slot"] \
        if fam == "solana" else ["chain_id", "code_hash", "implementation", "implementation_code_hash", "proxy_admin", "owner"]
    return {k: obs["fields"][k]["value"] for k in keys
            if k in obs["fields"] and obs["fields"][k]["status"] == "OBSERVED"}
