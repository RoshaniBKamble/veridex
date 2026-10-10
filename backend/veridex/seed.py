"""Deterministic demo environment (clearly labelled DEMO / SIMULATED) + controlled drift simulation."""
import logging

from eth_hash.auto import keccak

from .core import DEMO_PROJECT_ID, audit, db, new_id, now
from .drift import verify_deployment
from .findings import refresh_findings
from . import workflow as wf

log = logging.getLogger("veridex.seed")
DEMO_COLLECTIONS = ["releases", "evidence", "approvals", "attestations", "deployments", "observations",
                    "drift_events", "incidents", "findings", "permission_observations", "audit_events",
                    "ai_explanations"]


def _h(s: str) -> str:
    return "0x" + keccak(s.encode()).hex()


DEMO_STATE = {
    "chain_id": "1337",
    "code_hash": _h("aurora-vault-proxy-runtime"),
    "implementation": "0x5f3c9a2e7b1d4c8e6a0f2b9d3e7c1a5b8d4f6e20",
    "implementation_code_hash": _h("aurora-vault-impl-v2.4.0-runtime"),
    "proxy_admin": "0x9a1e3c5b7d2f4a6c8e0b1d3f5a7c9e2b4d6f8a01",
    "owner": "0x9a1e3c5b7d2f4a6c8e0b1d3f5a7c9e2b4d6f8a01",
}
DRIFTED = {
    "implementation": "0xbad0c0de4e1f2a3b4c5d6e7f8091a2b3c4d5e6f7",
    "implementation_code_hash": _h("unreviewed-implementation-runtime"),
    "proxy_admin": "0xe0a71c2d3f4b5a6978c8d9e0f1a2b3c4d5e6f7a8",
}
DEMO_ADDR = "0x7a25d1c0ffee4b6e9d3a2c1b0f9e8d7c6b5a4321"
LIVE_REFS = [
    ("ethereum-mainnet", "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
     "Aave V3 Pool (public reference, LIVE read-only)"),
    ("solana-mainnet", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
     "Jupiter v6 program (public reference, LIVE read-only)"),
]


def _evidence(version, commit, impl_hash):
    return [
        ("source_commit", f"Source commit {commit[:10]}", {
            "repository": "github.com/aurora-demo/aurora-protocol", "commit": commit, "branch": "main",
            "tree_hash": _h(f"tree-{version}")[:42], "signed_commit": True, "note": "DEMO record"}),
        ("build_artifact", f"Foundry build {version}", {
            "toolchain": "foundry 1.2.3 / solc 0.8.24", "optimizer_runs": 200, "contract": "AuroraVaultV2",
            "runtime_bytecode_keccak256": impl_hash, "note": "DEMO record"}),
        ("test_report", f"Test suite {version}", {
            "framework": "forge test", "passed": 412, "failed": 0, "skipped": 3, "line_coverage_bp": 9130,
            "note": "DEMO record; coverage in basis points"}),
        ("security_review", f"Internal security review {version}", {
            "reviewer": "Demo security lead (fictional)", "scope": ["AuroraVaultV2", "RateModel"],
            "open_findings": 0, "note": "DEMO record — not a third-party audit"}),
    ]


async def _demo_users():
    users = []
    for uid, name, email in [("usr_demo_lena", "Lena Ortiz (Demo CTO)", "lena@demo.veridex.invalid"),
                             ("usr_demo_ravi", "Ravi Menon (Demo Security)", "ravi@demo.veridex.invalid")]:
        u = await db.users.find_one({"_id": uid})
        if not u:
            u = {"_id": uid, "email": email, "name": name, "role": "demo", "password_hash": "!disabled", "created_at": now()}
            await db.users.insert_one(u)
        users.append(u)
    return users


async def _attested_release(project, users, version, commit, evidence, notes):
    actor = users[0]["email"]
    r = await wf.create_release(project, actor, version, commit, "main", notes)
    for t, title, payload in evidence:
        await wf.add_evidence(r, actor, t, title, payload, demo=True)
    await wf.seal_release(await db.releases.find_one({"_id": r["_id"]}), actor)
    for u in users:
        await wf.approve_release(await db.releases.find_one({"_id": r["_id"]}), project, u, "approve",
                                 "Reviewed manifest and evidence (DEMO)")
    await wf.attest_release(await db.releases.find_one({"_id": r["_id"]}), actor)
    return await db.releases.find_one({"_id": r["_id"]})


async def seed_demo(force=False):
    if await db.projects.find_one({"_id": DEMO_PROJECT_ID}) and not force:
        return
    for c in DEMO_COLLECTIONS:
        await db[c].delete_many({"project_id": DEMO_PROJECT_ID})
    await db.projects.delete_one({"_id": DEMO_PROJECT_ID})
    users = await _demo_users()
    project = await wf.create_project(users[0], "Aurora Lending Protocol",
                                      "Fictional lending protocol used to demonstrate the VERIDEX workflow. All records are DEMO data.",
                                      "github.com/aurora-demo/aurora-protocol", required_approvals=2, is_demo=True,
                                      pid=DEMO_PROJECT_ID)
    await db.projects.update_one({"_id": DEMO_PROJECT_ID}, {"$push": {"members": {
        "user_id": users[1]["_id"], "role": "approver", "name": users[1]["name"], "email": users[1]["email"]}}})
    project = await db.projects.find_one({"_id": DEMO_PROJECT_ID})
    c1, c2 = "4c1e9b07d2a85f3e6b9c0d1a2e3f4b5c6d7e8f90", "7f2a1c9e3b5d8f0a2c4e6b8d0f1a3c5e7b9d2f46"
    await _attested_release(project, users, "v2.3.1", c1, _evidence("v2.3.1", c1, _h("aurora-vault-impl-v2.3.1-runtime")),
                            "Aurora v2.3.1 (DEMO)")
    rel = await _attested_release(project, users, "v2.4.0", c2,
                                  _evidence("v2.4.0", c2, DEMO_STATE["implementation_code_hash"]) +
                                  [("deployment_manifest", "Deployment plan v2.4.0", {
                                      "network": "veridex-demo-evm", "proxy": DEMO_ADDR,
                                      "implementation": DEMO_STATE["implementation"],
                                      "proxy_admin": DEMO_STATE["proxy_admin"], "note": "DEMO record"})],
                                  "Aurora v2.4.0 — rate model upgrade (DEMO)")
    from .crypto import hash_obj  # noqa: E402
    dep_placeholder = "dep_demo_vault"
    await db.demo_chain_state.replace_one({"_id": dep_placeholder},
                                          {"_id": dep_placeholder, "fields": dict(DEMO_STATE),
                                           "baseline": dict(DEMO_STATE), "block": 1000}, upsert=True)
    dep = {"_id": dep_placeholder, "project_id": DEMO_PROJECT_ID, "release_id": rel["_id"],
           "release_version": rel["version"], "network": "veridex-demo-evm", "address": DEMO_ADDR,
           "label": "AuroraVault proxy (DEMO)", "verification_status": None, "comparisons": [],
           "expected": {"version": 1, "fields": dict(DEMO_STATE), "source": "declared",
                        "release_id": rel["_id"], "manifest_hash": rel["manifest_hash"],
                        "created_by": users[0]["email"], "created_at": now()},
           "created_by": users[0]["email"], "created_at": now()}
    await db.deployments.insert_one(dep)
    await db.expected_states.insert_one({"_id": new_id("exp"), "deployment_id": dep_placeholder, **dep["expected"]})
    await verify_deployment(dep, "seed")
    na = "Not applicable: third-party public program; VERIDEX holds no source or build for it"
    ref = await _attested_release(project, users, "ref-2026.06", "0" * 40, [
        ("source_commit", "Reference source (n/a)", {"repository": "third-party", "note": na}),
        ("build_artifact", "Reference build (n/a)", {"artifact": "none", "note": na}),
        ("test_report", "Reference tests (n/a)", {"tests": "none", "note": na}),
        ("deployment_manifest", "Public mainnet reference set", {
                                      "purpose": "Demonstrate LIVE read-only verification against public mainnet programs",
                                      "contracts": [a for _, a, _ in LIVE_REFS], "ownership": "third-party; not operated by Aurora",
                                      "baseline": "trust-on-first-use observation at seed time", "refs_hash": hash_obj({"refs": [list(x) for x in LIVE_REFS]})})],
        "Read-only LIVE reference set. Attests the observed baseline record only, not third-party code.")
    for net, addr, label in LIVE_REFS:
        try:
            await wf.create_deployment(ref, "seed", net, addr, label, {}, baseline=True, strict=False)
        except Exception as e:  # noqa: BLE001
            log.warning("live reference seed failed for %s: %s", net, e)
    await refresh_findings(DEMO_PROJECT_ID)
    log.info("demo project seeded")


async def simulate_drift(dep, actor):
    st = await db.demo_chain_state.find_one({"_id": dep["_id"]})
    await db.demo_chain_state.update_one({"_id": dep["_id"]}, {"$set": {**{f"fields.{k}": v for k, v in DRIFTED.items()},
                                                                        "block": st["block"] + 1}})
    await audit(dep["project_id"], actor, "demo.drift_simulated", "deployment", dep["_id"],
                {"changed_fields": list(DRIFTED), "note": "SIMULATED state change; no real transaction"})
    res = await verify_deployment(dep, actor)
    await refresh_findings(dep["project_id"])
    return res


async def reset_demo_state(dep, actor):
    st = await db.demo_chain_state.find_one({"_id": dep["_id"]})
    await db.demo_chain_state.update_one({"_id": dep["_id"]}, {"$set": {"fields": st["baseline"], "block": st["block"] + 1}})
    for e in await db.evidence.find({"project_id": dep["project_id"], "label": "DEMO"}).to_list(200):
        if e["payload"] != e.get("demo_original_payload", e["payload"]):
            await db.evidence.update_one({"_id": e["_id"]}, {"$set": {"payload": e["demo_original_payload"]}})
            await wf.verify_evidence(await db.evidence.find_one({"_id": e["_id"]}), actor)
    res = await verify_deployment(dep, actor)
    await db.drift_events.update_many({"deployment_id": dep["_id"], "status": "OPEN"},
                                      {"$set": {"status": "RESOLVED", "resolved_at": now()}})
    await db.permission_observations.update_many({"deployment_id": dep["_id"], "review_status": "REVIEW_REQUIRED"},
                                                 {"$set": {"review_status": "RESOLVED_DEMO_RESET"}})
    await db.incidents.update_many({"deployment_id": dep["_id"], "status": {"$ne": "RESOLVED"}, "simulated": True},
                                   {"$set": {"status": "RESOLVED", "updated_at": now()},
                                    "$push": {"timeline": {"at": now(), "actor": actor, "type": "RESOLVED",
                                                           "note": "Demo state reset to approved baseline; re-verification passed."}}})
    await audit(dep["project_id"], actor, "demo.reset", "deployment", dep["_id"], {})
    await refresh_findings(dep["project_id"])
    return res


async def tamper_evidence(ev, actor):
    payload = {**ev["payload"], "failed": 3, "tampered_note": "SIMULATED post-approval edit"}
    await db.evidence.update_one({"_id": ev["_id"]}, {"$set": {"payload": payload}})
    await audit(ev["project_id"], actor, "demo.evidence_tampered", "evidence", ev["_id"], {"note": "SIMULATED"})
    return await wf.verify_evidence(await db.evidence.find_one({"_id": ev["_id"]}), actor)
