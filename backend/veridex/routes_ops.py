from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .ai import ai_configured, deterministic_analysis, incident_context, stream_explanation, MODEL
from .auth import APPROVE_ROLES, WRITE_ROLES, current_user, project_access
from .chains import NETWORKS, network_status_list, observe, ping
from .core import DEMO_PROJECT_ID, audit, db, now, out, outs
from .crypto import CANON_RULES, CANON_VERSION, key_id, public_key_hex
from .drift import TRANSITIONS, baseline_from_observation, freshness, verify_deployment
from .findings import recommended_actions, refresh_findings, trust_score
from .graph import build_graph
from .routes_release import load
from . import seed, workflow as wf

router = APIRouter(prefix="/api", tags=["operations"])


class DeploymentIn(BaseModel):
    network: str
    address: str = Field(min_length=10, max_length=64)
    label: str = Field(min_length=2, max_length=80)
    expected: Optional[Dict[str, Optional[str]]] = None
    baseline_from_observation: bool = False


class ExpectedIn(BaseModel):
    fields: Dict[str, Optional[str]]


class StatusIn(BaseModel):
    status: Literal["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"]
    note: str = Field(default="", max_length=1000)


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class FindingStatusIn(BaseModel):
    status: Literal["ACKNOWLEDGED", "OPEN"]


def _dep_out(d):
    x = out(d)
    x["freshness"] = freshness(d)
    x["simulated"] = NETWORKS[d["network"]]["family"] == "demo-evm"
    x["network_name"] = NETWORKS[d["network"]]["name"]
    return x


@router.get("/networks")
async def networks(user=Depends(current_user)):
    return await network_status_list()


@router.post("/networks/check")
async def check_networks(user=Depends(current_user)):
    return {nid: await ping(nid) for nid in NETWORKS}


@router.post("/networks/{nid}/inspect")
async def inspect(nid: str, body: Dict[str, Any], user=Depends(current_user)):
    address = str(body.get("address", ""))
    wf.validate_address(nid, address)
    return await observe({"_id": "inspect", "network": nid, "address": address})


@router.post("/releases/{rid}/deployments")
async def create_dep(rid: str, body: DeploymentIn, user=Depends(current_user)):
    r, _, _ = await load("releases", rid, user, WRITE_ROLES)
    if NETWORKS.get(body.network, {}).get("family") == "demo-evm":
        raise HTTPException(422, "The simulated demo network is reserved for the seeded demo project")
    d = await wf.create_deployment(r, user["email"], body.network, body.address, body.label, body.expected,
                                   body.baseline_from_observation)
    return _dep_out(d)


@router.get("/projects/{pid}/deployments")
async def list_deps(pid: str, user=Depends(current_user)):
    await project_access(pid, user)
    return [_dep_out(d) for d in await db.deployments.find({"project_id": pid}).sort("created_at", 1).to_list(200)]


@router.get("/deployments/{did}")
async def get_dep(did: str, user=Depends(current_user)):
    d, p, role = await load("deployments", did, user)
    obs = await db.observations.find_one({"_id": d.get("last_observation_id")}) if d.get("last_observation_id") else None
    nets = {n["id"]: n for n in await network_status_list()}
    return {**_dep_out(d), "my_role": role, "project": {"id": p["_id"], "name": p["name"], "is_demo": p.get("is_demo")},
            "release": out(await db.releases.find_one({"_id": d["release_id"]}, {"manifest": 0})),
            "attestation": out(await db.attestations.find_one({"release_id": d["release_id"]}, {"statement": 0})),
            "last_observation": out(obs), "network_status": nets[d["network"]],
            "expected_history": outs(await db.expected_states.find({"deployment_id": did}).sort("version", -1).to_list(20)),
            "permissions": outs(await db.permission_observations.find({"deployment_id": did}).sort("observed_at", -1).to_list(50)),
            "drift_events": outs(await db.drift_events.find({"deployment_id": did}).sort("detected_at", -1).to_list(50)),
            "incidents": outs(await db.incidents.find({"deployment_id": did}, {"timeline": 0}).sort("created_at", -1).to_list(20)),
            "observations": outs(await db.observations.find({"deployment_id": did}, {"fields": 0}).sort("observed_at", -1).to_list(10))}


@router.post("/deployments/{did}/verify")
async def verify(did: str, user=Depends(current_user)):
    d, p, _ = await load("deployments", did, user, WRITE_ROLES)
    res = await verify_deployment(d, user["email"])
    await refresh_findings(p["_id"])
    return res


@router.put("/deployments/{did}/expected")
async def put_expected(did: str, body: ExpectedIn, user=Depends(current_user)):
    d, p, _ = await load("deployments", did, user, APPROVE_ROLES)
    fields = {k: v for k, v in body.fields.items() if v not in (None, "")}
    exp = await wf.set_expected(d, user["email"], fields, "declared")
    await verify_deployment(await db.deployments.find_one({"_id": did}), user["email"])
    await refresh_findings(p["_id"])
    return exp


@router.post("/deployments/{did}/baseline")
async def rebaseline(did: str, user=Depends(current_user)):
    d, p, _ = await load("deployments", did, user, APPROVE_ROLES)
    if p.get("is_demo") and d["_id"] == "dep_demo_vault":
        raise HTTPException(409, "Use 'Reset demo state' for the simulated deployment")
    obs = await observe(d)
    if obs["mode"] == "UNAVAILABLE":
        raise HTTPException(424, f"Cannot baseline: {obs['error']}")
    exp = await wf.set_expected(d, user["email"], baseline_from_observation(obs, d["network"]),
                                "baseline_observation (manual re-baseline)")
    await verify_deployment(await db.deployments.find_one({"_id": did}), user["email"])
    await refresh_findings(p["_id"])
    return exp


async def _demo_dep(did, user):
    d, p, _ = await load("deployments", did, user, WRITE_ROLES)
    if not p.get("is_demo") or NETWORKS[d["network"]]["family"] != "demo-evm":
        raise HTTPException(403, "Drift simulation is only available for the simulated demo deployment")
    return d


@router.post("/deployments/{did}/simulate-drift")
async def simulate(did: str, user=Depends(current_user)):
    return await seed.simulate_drift(await _demo_dep(did, user), user["email"])


@router.post("/deployments/{did}/reset-demo")
async def reset(did: str, user=Depends(current_user)):
    return await seed.reset_demo_state(await _demo_dep(did, user), user["email"])


@router.post("/evidence/{eid}/tamper-demo")
async def tamper(eid: str, user=Depends(current_user)):
    e, p, _ = await load("evidence", eid, user, WRITE_ROLES)
    if not p.get("is_demo") or e.get("label") != "DEMO":
        raise HTTPException(403, "Tamper simulation is only available on DEMO evidence")
    res = await seed.tamper_evidence(e, user["email"])
    await refresh_findings(p["_id"])
    return res


@router.post("/demo/reseed")
async def reseed(user=Depends(current_user)):
    await seed.seed_demo(force=True)
    return {"ok": True, "project_id": DEMO_PROJECT_ID}


@router.get("/projects/{pid}/drift-events")
async def drift_events(pid: str, user=Depends(current_user), limit: int = Query(100, le=500)):
    await project_access(pid, user)
    return outs(await db.drift_events.find({"project_id": pid}).sort("detected_at", -1).to_list(limit))


@router.get("/projects/{pid}/permissions")
async def permissions(pid: str, user=Depends(current_user)):
    await project_access(pid, user)
    deps = {d["_id"]: d for d in await db.deployments.find({"project_id": pid}).to_list(200)}
    rows = []
    for x in await db.permission_observations.find({"project_id": pid}).sort("observed_at", -1).to_list(500):
        r = out(x)
        r["deployment_label"] = deps.get(x["deployment_id"], {}).get("label")
        rows.append(r)
    return rows


@router.get("/projects/{pid}/findings")
async def findings(pid: str, user=Depends(current_user), status: Optional[str] = None):
    await project_access(pid, user)
    await refresh_findings(pid)
    q = {"project_id": pid}
    if status:
        q["status"] = status
    return outs(await db.findings.find(q, {"dedup_key": 0}).sort("last_seen_at", -1).to_list(300))


@router.post("/findings/{fid}/status")
async def finding_status(fid: str, body: FindingStatusIn, user=Depends(current_user)):
    f, _, _ = await load("findings", fid, user, WRITE_ROLES)
    await db.findings.update_one({"_id": fid}, {"$set": {"status": body.status, "acknowledged_by": user["email"]}})
    await audit(f["project_id"], user["email"], f"finding.{body.status.lower()}", "finding", fid)
    return {"ok": True}


@router.get("/projects/{pid}/incidents")
async def incidents(pid: str, user=Depends(current_user)):
    await project_access(pid, user)
    return outs(await db.incidents.find({"project_id": pid}, {"timeline": 0}).sort("created_at", -1).to_list(200))


@router.get("/incidents/{iid}")
async def incident(iid: str, user=Depends(current_user)):
    inc, p, role = await load("incidents", iid, user)
    ctx = await incident_context(inc)
    dep = await db.deployments.find_one({"_id": inc["deployment_id"]})
    return {**out(inc), "my_role": role, "project": {"id": p["_id"], "name": p["name"], "is_demo": p.get("is_demo")},
            "deployment": _dep_out(dep) if dep else None,
            "release": out(await db.releases.find_one({"_id": inc["release_id"]}, {"manifest": 0})),
            "attestation": out(await db.attestations.find_one({"_id": inc.get("attestation_id")}, {"statement": 0})),
            "evidence": outs(await db.evidence.find({"_id": {"$in": inc.get("evidence_ids", [])}},
                                                    {"payload": 0, "demo_original_payload": 0}).to_list(50)),
            "drift_events": outs(await db.drift_events.find({"_id": {"$in": inc["drift_event_ids"]}}, {"dedup_key": 0}).to_list(50)),
            "analysis": deterministic_analysis(ctx),
            "ai_explanations": outs(await db.ai_explanations.find({"incident_id": iid}).sort("created_at", -1).to_list(5)),
            "ai_available": ai_configured()}


@router.post("/incidents/{iid}/status")
async def incident_status(iid: str, body: StatusIn, user=Depends(current_user)):
    inc, _, _ = await load("incidents", iid, user, WRITE_ROLES)
    if body.status not in TRANSITIONS[inc["status"]]:
        raise HTTPException(409, f"Cannot move incident from {inc['status']} to {body.status}")
    entry = {"at": now(), "actor": user["email"], "type": body.status, "note": body.note}
    await db.incidents.update_one({"_id": iid}, {"$set": {"status": body.status, "updated_at": now()},
                                                 "$push": {"timeline": entry}})
    await audit(inc["project_id"], user["email"], f"incident.{body.status.lower()}", "incident", iid)
    return out(await db.incidents.find_one({"_id": iid}))


@router.post("/incidents/{iid}/notes")
async def incident_note(iid: str, body: NoteIn, user=Depends(current_user)):
    await load("incidents", iid, user, WRITE_ROLES)
    await db.incidents.update_one({"_id": iid}, {"$push": {"timeline": {"at": now(), "actor": user["email"],
                                                                        "type": "NOTE", "note": body.note}}})
    return {"ok": True}


@router.post("/incidents/{iid}/ai-explain")
async def ai_explain(iid: str, user=Depends(current_user)):
    inc, _, _ = await load("incidents", iid, user)
    if not ai_configured():
        raise HTTPException(503, "AI provider not configured. Deterministic analysis remains available.")

    async def gen():
        try:
            async for chunk in stream_explanation(inc):
                yield chunk
        except Exception as e:  # noqa: BLE001
            yield f"\n\n[AI provider error: {type(e).__name__}. Deterministic analysis remains available.]"

    return StreamingResponse(gen(), media_type="text/plain",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/projects/{pid}/graph")
async def graph(pid: str, user=Depends(current_user)):
    await project_access(pid, user)
    return await build_graph(pid)


@router.get("/public/demo-graph")
async def public_demo_graph():
    g = await build_graph(DEMO_PROJECT_ID)
    deps = await db.deployments.find({"project_id": DEMO_PROJECT_ID}, {"comparisons": 1, "label": 1, "network": 1,
                                                                     "verification_status": 1, "observation_mode": 1,
                                                                     "last_block_ref": 1, "last_observed_at": 1}).to_list(20)
    return {**g, "label": "DEMO project records (Aurora Lending Protocol is fictional)", "deployments": outs(deps)}


@router.get("/projects/{pid}/audit")
async def audit_log(pid: str, user=Depends(current_user), limit: int = Query(50, le=300)):
    await project_access(pid, user)
    return outs(await db.audit_events.find({"project_id": pid}).sort("created_at", -1).to_list(limit))


@router.get("/projects/{pid}/overview")
async def overview(pid: str, user=Depends(current_user)):
    p, role = await project_access(pid, user)
    await refresh_findings(pid)
    deps = await db.deployments.find({"project_id": pid}).to_list(200)
    rels = await db.releases.find({"project_id": pid}, {"manifest": 0}).sort("created_at", -1).to_list(200)
    fnd = await db.findings.find({"project_id": pid, "status": {"$ne": "RESOLVED"}}).to_list(500)
    sev = {}
    for f in fnd:
        sev[f["severity"]] = sev.get(f["severity"], 0) + 1
    by = lambda items, key: {k: sum(1 for i in items if i.get(key) == k) for k in {i.get(key) for i in items}}  # noqa: E731
    open_inc = await db.incidents.find({"project_id": pid, "status": {"$ne": "RESOLVED"}}, {"timeline": 0}).to_list(50)
    return {"project": {**out(p), "my_role": role}, "trust": await trust_score(pid),
            "releases_by_status": by(rels, "status"), "deployments_by_status": by(deps, "verification_status"),
            "freshness": {k: sum(1 for d in deps if freshness(d) == k) for k in ("FRESH", "STALE", "NEVER")},
            "findings_by_severity": sev, "open_findings": len(fnd),
            "open_drift": await db.drift_events.count_documents({"project_id": pid, "status": "OPEN"}),
            "open_incidents": outs(open_inc), "recent_releases": outs(rels[:6]),
            "deployments": [_dep_out({k: v for k, v in d.items()}) for d in deps],
            "recent_activity": outs(await db.audit_events.find({"project_id": pid}).sort("created_at", -1).to_list(12)),
            "recommended_actions": await recommended_actions(pid)}


@router.get("/settings")
async def settings(user=Depends(current_user)):
    return {"attestor": {"algorithm": "Ed25519", "key_id": key_id(), "public_key": public_key_hex(),
                         "private_key_storage": "ATTESTOR_SIGNING_KEY env var (server-side only, never returned)"},
            "canonicalization": {"version": CANON_VERSION, "rules": CANON_RULES},
            "ai": {"configured": ai_configured(), "model": f"{MODEL[0]}/{MODEL[1]}",
                   "policy": "Explains incidents only. Cannot approve releases, change policies or expected state."},
            "env": {k: bool(__import__("os").environ.get(k)) for k in
                    ["ETHEREUM_RPC_URL", "SOLANA_RPC_URL", "BASE_RPC_URL", "ARBITRUM_RPC_URL", "EMERGENT_LLM_KEY",
                     "ATTESTOR_SIGNING_KEY", "JWT_SECRET"]},
            "stale_after_minutes": int(__import__("os").environ["STALE_AFTER_MINUTES"]),
            "registry_contract": {"path": "contracts/VeridexAttestationRegistry.sol", "status": "COMPILED_AND_TESTED_LOCALLY",
                                  "deployed": False}}
