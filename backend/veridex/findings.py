"""Deterministic security findings, transparent trust score and recommended actions."""
from .core import db, new_id, now
from .drift import freshness

REQUIRED_EVIDENCE = ["source_commit", "build_artifact", "test_report"]


async def _upsert(project_id, key, **data):
    ex = await db.findings.find_one({"dedup_key": key})
    if ex:
        upd = {"last_seen_at": now(), **{k: v for k, v in data.items() if k not in ("status",)}}
        if ex["status"] == "RESOLVED":
            upd.update({"status": "OPEN", "resolved_at": None})
        await db.findings.update_one({"_id": ex["_id"]}, {"$set": upd})
        return ex["_id"]
    fid = new_id("fnd")
    await db.findings.insert_one({"_id": fid, "dedup_key": key, "project_id": project_id, "status": "OPEN",
                                  "kind": "DETERMINISTIC", "detected_at": now(), "last_seen_at": now(), **data})
    return fid


async def refresh_findings(project_id: str) -> None:
    active = set()
    releases = await db.releases.find({"project_id": project_id}).to_list(500)
    deps = await db.deployments.find({"project_id": project_id}).to_list(500)
    deployed = {d["release_id"] for d in deps}
    for r in releases:
        evs = await db.evidence.find({"release_id": r["_id"]}).to_list(200)
        for e in evs:
            if e.get("integrity_status") == "FAILED":
                k = f"integrity:{e['_id']}"
                active.add(k)
                await _upsert(project_id, k, rule="EVIDENCE_INTEGRITY_FAILED", severity="CRITICAL",
                              title=f"Evidence integrity check failed: {e['title']}",
                              entity_type="evidence", entity_id=e["_id"], release_id=r["_id"],
                              evidence={"recorded_hash": e["hash"], "recomputed_hash": e.get("last_recomputed_hash")},
                              recommended_action="Stored evidence no longer matches its recorded hash. Treat the release as untrusted and investigate who modified the record.")
        if r["_id"] in deployed:
            types = {e["type"] for e in evs}
            missing = [t for t in REQUIRED_EVIDENCE if t not in types]
            if missing:
                k = f"missing:{r['_id']}"
                active.add(k)
                await _upsert(project_id, k, rule="MISSING_RELEASE_EVIDENCE", severity="HIGH",
                              title=f"Deployed release {r['version']} is missing required evidence",
                              entity_type="release", entity_id=r["_id"], release_id=r["_id"],
                              evidence={"missing_types": missing},
                              recommended_action="Attach the missing evidence types, then re-seal and re-approve.")
            if r["status"] != "attested":
                k = f"unattested:{r['_id']}"
                active.add(k)
                sev = "HIGH" if r["status"] in ("draft", "sealed") else "MEDIUM"
                await _upsert(project_id, k, rule="DEPLOYED_WITHOUT_ATTESTATION", severity=sev,
                              title=f"Release {r['version']} is deployed but not attested ({r['status']})",
                              entity_type="release", entity_id=r["_id"], release_id=r["_id"],
                              evidence={"release_status": r["status"], "approvals": len(r.get("approval_ids", []))},
                              recommended_action="Complete the approval workflow and issue an attestation.")
    for d in deps:
        st = d.get("verification_status")
        if st == "DRIFT":
            for c in d.get("comparisons", []):
                if c["status"] == "MISMATCH":
                    k = f"drift:{d['_id']}:{c['field']}"
                    active.add(k)
                    await _upsert(project_id, k, rule="DEPLOYMENT_STATE_MISMATCH", severity=c["severity"],
                                  title=f"{c['field']} mismatch on {d['label']}", entity_type="deployment",
                                  entity_id=d["_id"], release_id=d["release_id"],
                                  evidence={"expected": c["expected"], "observed": c["observed"], "source": c["source"]},
                                  simulated=d.get("observation_mode") == "SIMULATED",
                                  recommended_action=c["next_action"])
        if st == "UNAVAILABLE":
            k = f"unavailable:{d['_id']}"
            active.add(k)
            await _upsert(project_id, k, rule="VERIFICATION_UNAVAILABLE", severity="MEDIUM",
                          title=f"Verification unavailable for {d['label']}", entity_type="deployment",
                          entity_id=d["_id"], release_id=d["release_id"], evidence={"error": d.get("last_error")},
                          recommended_action="Check the RPC configuration. Missing data is not treated as drift.")
        if d.get("last_observed_at") and freshness(d) == "STALE":
            k = f"stale:{d['_id']}"
            active.add(k)
            await _upsert(project_id, k, rule="STALE_OBSERVATION", severity="LOW",
                          title=f"Production observation is stale for {d['label']}", entity_type="deployment",
                          entity_id=d["_id"], release_id=d["release_id"],
                          evidence={"last_observed_at": d["last_observed_at"]},
                          recommended_action="Run verification to refresh observed state.")
    perms = await db.permission_observations.find({"project_id": project_id, "changed": True,
                                                   "review_status": "REVIEW_REQUIRED"}).to_list(200)
    for p in perms:
        k = f"perm:{p['_id']}"
        active.add(k)
        await _upsert(project_id, k, rule="PRIVILEGED_AUTHORITY_CHANGED", severity="HIGH",
                      title=f"Privileged {p['field']} changed", entity_type="deployment", entity_id=p["deployment_id"],
                      evidence={"previous": p["previous"], "observed": p["value"], "source": p["source"]},
                      simulated=p["verification"] == "SIMULATED",
                      recommended_action="Confirm the change against authorised multisig/governance actions. Not every change is malicious.")
    await db.findings.update_many(
        {"project_id": project_id, "status": {"$ne": "RESOLVED"}, "dedup_key": {"$nin": list(active)}},
        {"$set": {"status": "RESOLVED", "resolved_at": now(), "resolution": "Condition no longer observed"}})


async def trust_score(project_id: str) -> dict:
    deps = await db.deployments.find({"project_id": project_id}).to_list(500)
    rel_ids = list({d["release_id"] for d in deps})
    evs = await db.evidence.find({"release_id": {"$in": rel_ids}}).to_list(1000)
    rels = await db.releases.find({"_id": {"$in": rel_ids}}).to_list(500)
    n = len(deps)

    def ratio(a, b):
        return round(a / b, 4) if b else 0.0

    ver_pts = {"VERIFIED": 1, "PARTIAL": 0.5}
    auth_bad = sum(1 for d in deps if any(c["status"] == "MISMATCH" and c["field"] in
                                          ("owner", "proxy_admin", "upgrade_authority", "implementation")
                                          for c in d.get("comparisons", [])))
    comps = [
        {"key": "evidence_integrity", "label": "Release evidence integrity", "weight": 25,
         "value": ratio(sum(1 for e in evs if e.get("integrity_status") == "VERIFIED"), len(evs)),
         "explain": "Share of evidence on deployed releases whose recomputed SHA-256 matches the recorded hash."},
        {"key": "attestation", "label": "Attestation coverage", "weight": 20,
         "value": ratio(sum(1 for r in rels if r["status"] == "attested"), len(rels)),
         "explain": "Share of deployed releases with a signed Ed25519 attestation."},
        {"key": "production", "label": "Production verification", "weight": 25,
         "value": ratio(sum(ver_pts.get(d.get("verification_status"), 0) for d in deps), n),
         "explain": "VERIFIED = 1, PARTIAL = 0.5, DRIFT / UNAVAILABLE / never checked = 0, averaged over deployments."},
        {"key": "authority", "label": "Privileged authority health", "weight": 15,
         "value": ratio(n - auth_bad, n) if n else 0.0,
         "explain": "Share of deployments with no owner / admin / implementation / upgrade-authority mismatch."},
        {"key": "freshness", "label": "Observation freshness", "weight": 15,
         "value": ratio(sum(1 for d in deps if freshness(d) == "FRESH"), n),
         "explain": "Share of deployments observed within the staleness window."},
    ]
    for c in comps:
        c["points"] = round(c["value"] * c["weight"], 1)
    score = round(sum(c["points"] for c in comps), 1) if n else None
    return {"score": score, "components": comps, "formula": "score = Σ(component_value × weight), weights sum to 100",
            "disclaimer": "Operational posture indicator computed from VERIDEX records. Not a security audit, rating or guarantee."}


async def recommended_actions(project_id: str) -> list:
    acts = []
    for i in await db.incidents.find({"project_id": project_id, "status": {"$ne": "RESOLVED"}}).to_list(20):
        acts.append({"priority": i["severity"], "text": f"Investigate {i['number']}: {i['title']}",
                     "link": f"/app/incidents/{i['_id']}"})
    for r in await db.releases.find({"project_id": project_id, "status": {"$in": ["draft", "sealed", "approved"]}}).to_list(20):
        nxt = {"draft": "Attach evidence and seal", "sealed": "Collect approvals for", "approved": "Issue attestation for"}[r["status"]]
        acts.append({"priority": "MEDIUM", "text": f"{nxt} release {r['version']}", "link": f"/app/releases/{r['_id']}"})
    for d in await db.deployments.find({"project_id": project_id}).to_list(50):
        if freshness(d) != "FRESH" or d.get("verification_status") == "UNAVAILABLE":
            acts.append({"priority": "LOW", "text": f"Re-verify {d['label']}", "link": f"/app/deployments/{d['_id']}"})
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    return sorted(acts, key=lambda a: order.get(a["priority"], 4))[:8]
