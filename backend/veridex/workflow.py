"""Release workflow service: projects, releases, evidence, sealing, approvals, attestations, deployments."""
import re

from fastapi import HTTPException

from .chains import NETWORKS, observe
from .core import audit, db, new_id, now
from .crypto import (CANON_VERSION, CanonicalizationError, build_manifest, canonicalize, hash_obj, key_id,
                     public_key_hex, sign)
from .drift import baseline_from_observation, verify_deployment
from .findings import REQUIRED_EVIDENCE, refresh_findings

EVIDENCE_TYPES = ["source_commit", "build_artifact", "test_report", "security_review", "deployment_manifest", "other"]
EVM_ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")
SOL_ADDR = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


async def create_project(user, name, description, repository, required_approvals=1, is_demo=False, pid=None):
    p = {"_id": pid or new_id("prj"), "name": name, "description": description, "repository": repository,
         "required_approvals": required_approvals, "is_demo": is_demo, "created_by": user["_id"],
         "members": [{"user_id": user["_id"], "role": "owner", "name": user["name"], "email": user["email"]}],
         "created_at": now()}
    await db.projects.insert_one(p)
    await audit(p["_id"], user["email"], "project.created", "project", p["_id"], {"name": name})
    return p


async def create_release(project, actor, version, commit, branch, notes):
    if await db.releases.find_one({"project_id": project["_id"], "version": version}):
        raise HTTPException(409, f"Release {version} already exists in this project")
    r = {"_id": new_id("rel"), "project_id": project["_id"], "version": version, "commit": commit.lower(),
         "branch": branch, "notes": notes, "status": "draft", "evidence_ids": [], "approval_ids": [],
         "manifest": None, "manifest_hash": None, "created_by": actor, "created_at": now()}
    await db.releases.insert_one(r)
    await audit(project["_id"], actor, "release.created", "release", r["_id"], {"version": version})
    return r


async def add_evidence(release, actor, etype, title, payload, source_uri=None, demo=False):
    if release["status"] != "draft":
        raise HTTPException(409, "Release is sealed; evidence is immutable. Create a new release to change evidence.")
    if etype not in EVIDENCE_TYPES:
        raise HTTPException(422, f"Unknown evidence type. Allowed: {', '.join(EVIDENCE_TYPES)}")
    try:
        canon = canonicalize(payload)
    except CanonicalizationError as e:
        raise HTTPException(422, f"Canonicalization failed: {e}")
    ev = {"_id": new_id("evd"), "release_id": release["_id"], "project_id": release["project_id"], "type": etype,
          "title": title, "payload": payload, "hash": hash_obj(payload), "canonical_size": len(canon),
          "canonicalization": CANON_VERSION, "source_uri": source_uri, "integrity_status": "VERIFIED",
          "last_verified_at": now(), "label": "DEMO" if demo else "USER_SUPPLIED", "created_by": actor,
          "created_at": now()}
    if demo:
        ev["demo_original_payload"] = payload
    await db.evidence.insert_one(ev)
    await db.releases.update_one({"_id": release["_id"]}, {"$push": {"evidence_ids": ev["_id"]}})
    await audit(release["project_id"], actor, "evidence.added", "evidence", ev["_id"], {"hash": ev["hash"]})
    return ev


async def verify_evidence(ev, actor):
    recomputed = hash_obj(ev["payload"])
    status = "VERIFIED" if recomputed == ev["hash"] else "FAILED"
    await db.evidence.update_one({"_id": ev["_id"]}, {"$set": {"integrity_status": status,
                                                               "last_recomputed_hash": recomputed,
                                                               "last_verified_at": now()}})
    await audit(ev["project_id"], actor, "evidence.verified", "evidence", ev["_id"], {"status": status})
    return {"evidence_id": ev["_id"], "recorded_hash": ev["hash"], "recomputed_hash": recomputed,
            "status": status, "checked_at": now()}


async def _verify_all(release, actor):
    evs = await db.evidence.find({"release_id": release["_id"]}).to_list(200)
    results = [await verify_evidence(e, actor) for e in evs]
    failed = [r for r in results if r["status"] == "FAILED"]
    if failed:
        raise HTTPException(409, f"Integrity check failed for {len(failed)} evidence item(s); cannot proceed.")
    return evs


async def seal_release(release, actor):
    if release["status"] != "draft":
        raise HTTPException(409, f"Release is already {release['status']}")
    evs = await _verify_all(release, actor)
    missing = [t for t in REQUIRED_EVIDENCE if t not in {e["type"] for e in evs}]
    if missing:
        raise HTTPException(422, f"Missing required evidence: {', '.join(missing)}")
    manifest = build_manifest(release, evs)
    mh = hash_obj(manifest)
    await db.releases.update_one({"_id": release["_id"]}, {"$set": {"status": "sealed", "manifest": manifest,
                                                                    "manifest_hash": mh, "sealed_at": now()}})
    await audit(release["project_id"], actor, "release.sealed", "release", release["_id"], {"manifest_hash": mh})
    return mh


async def approve_release(release, project, user, decision, comment):
    if release["status"] != "sealed":
        raise HTTPException(409, f"Only sealed releases can be reviewed (current: {release['status']})")
    if await db.approvals.find_one({"release_id": release["_id"], "approver_id": user["_id"]}):
        raise HTTPException(409, "You have already reviewed this release")
    evs = await _verify_all(release, user["email"])
    if hash_obj(build_manifest(release, evs)) != release["manifest_hash"]:
        raise HTTPException(409, "Manifest hash no longer matches evidence set; release cannot be approved.")
    a = {"_id": new_id("apr"), "release_id": release["_id"], "project_id": release["project_id"],
         "manifest_hash": release["manifest_hash"], "approver_id": user["_id"], "approver_name": user["name"],
         "approver_email": user["email"], "decision": decision, "comment": comment, "created_at": now()}
    await db.approvals.insert_one(a)
    upd = {"$push": {"approval_ids": a["_id"]}}
    approves = await db.approvals.count_documents({"release_id": release["_id"], "decision": "approve"})
    if decision == "reject":
        upd["$set"] = {"status": "rejected"}
    elif approves >= project["required_approvals"]:
        upd["$set"] = {"status": "approved", "approved_at": now()}
    await db.releases.update_one({"_id": release["_id"]}, upd)
    await audit(release["project_id"], user["email"], f"release.{decision}", "approval", a["_id"],
                {"manifest_hash": release["manifest_hash"]})
    return a


async def attest_release(release, actor):
    if release["status"] != "approved":
        raise HTTPException(409, f"Release must be approved before attestation (current: {release['status']})")
    approvals = await db.approvals.find({"release_id": release["_id"]}).sort("created_at", 1).to_list(50)
    statement = {
        "schema": "veridex.attestation.v1", "canonicalization": CANON_VERSION,
        "subject": {"project_id": release["project_id"], "release_id": release["_id"],
                    "version": release["version"], "commit": release["commit"]},
        "manifest_hash": release["manifest_hash"],
        "evidence": release["manifest"]["evidence"],
        "approvals": [{"id": a["_id"], "approver_id": a["approver_id"], "decision": a["decision"],
                       "manifest_hash": a["manifest_hash"], "at": a["created_at"]} for a in approvals],
        "issuer": key_id(), "issued_at": now(),
    }
    att = {"_id": new_id("att"), "release_id": release["_id"], "project_id": release["project_id"],
           "statement": statement, "statement_hash": hash_obj(statement), "signature": sign(canonicalize(statement)),
           "algorithm": "Ed25519", "public_key": public_key_hex(), "key_id": key_id(),
           "anchor_status": "OFFCHAIN_SIGNED",
           "anchor_note": "Not anchored onchain. VeridexAttestationRegistry.sol is compiled and unit-tested locally; "
                          "anchoring requires a configured network and authorised attestor key.",
           "created_by": actor, "created_at": now()}
    await db.attestations.insert_one(att)
    await db.releases.update_one({"_id": release["_id"]}, {"$set": {"status": "attested", "attestation_id": att["_id"],
                                                                    "attested_at": now()}})
    await audit(release["project_id"], actor, "release.attested", "attestation", att["_id"],
                {"statement_hash": att["statement_hash"]})
    return att


def validate_address(network, address):
    if network not in NETWORKS:
        raise HTTPException(422, f"Unsupported network. Allowed: {', '.join(NETWORKS)}")
    fam = NETWORKS[network]["family"]
    ok = SOL_ADDR.match(address) if fam == "solana" else EVM_ADDR.match(address)
    if not ok:
        raise HTTPException(422, "Invalid Solana program ID" if fam == "solana" else "Invalid EVM address (0x + 40 hex)")


async def create_deployment(release, actor, network, address, label, expected_fields, baseline, strict=True):
    validate_address(network, address)
    address = address if NETWORKS[network]["family"] == "solana" else address.lower()
    fields = {k: v for k, v in (expected_fields or {}).items() if v not in (None, "")}
    source = "declared"
    did = new_id("dep")
    if baseline:
        obs = await observe({"_id": did, "network": network, "address": address})
        if obs["mode"] == "UNAVAILABLE":
            if strict:
                raise HTTPException(424, f"Cannot baseline from observation: {obs['error']}")
        else:
            fields = {**baseline_from_observation(obs, network), **fields}
            source = "baseline_observation (trust-on-first-use)"
    expected = {"version": 1, "fields": fields, "source": source, "release_id": release["_id"],
                "manifest_hash": release.get("manifest_hash"), "created_by": actor, "created_at": now()}
    dep = {"_id": did, "project_id": release["project_id"], "release_id": release["_id"],
           "release_version": release["version"], "network": network, "address": address, "label": label,
           "expected": expected, "verification_status": None, "comparisons": [], "created_by": actor,
           "created_at": now()}
    await db.deployments.insert_one(dep)
    await db.expected_states.insert_one({"_id": new_id("exp"), "deployment_id": did, **expected})
    await audit(release["project_id"], actor, "deployment.registered", "deployment", did,
                {"network": network, "address": address})
    await verify_deployment(dep, actor)
    await refresh_findings(release["project_id"])
    return await db.deployments.find_one({"_id": did})


async def set_expected(dep, actor, fields, source):
    version = dep["expected"]["version"] + 1
    expected = {**dep["expected"], "version": version, "fields": fields, "source": source,
                "created_by": actor, "created_at": now()}
    await db.deployments.update_one({"_id": dep["_id"]}, {"$set": {"expected": expected}})
    await db.expected_states.insert_one({"_id": new_id("exp"), "deployment_id": dep["_id"], **expected})
    await audit(dep["project_id"], actor, "deployment.expected_state_updated", "deployment", dep["_id"],
                {"version": version, "source": source})
    return expected
