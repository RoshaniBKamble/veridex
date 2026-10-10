from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from .auth import APPROVE_ROLES, WRITE_ROLES, current_user, project_access
from .core import db, out, outs
from .crypto import CANON_VERSION, CanonicalizationError, canonicalize, hash_obj
from .drift import verify_attestation
from .findings import refresh_findings
from . import workflow as wf

router = APIRouter(prefix="/api", tags=["releases"])


async def load(coll, oid, user, roles=None):
    doc = await db[coll].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, f"{coll[:-1].capitalize()} not found")
    p, role = await project_access(doc["project_id"], user, roles)
    return doc, p, role


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    repository: str = Field(min_length=3, max_length=200)
    required_approvals: int = Field(default=1, ge=1, le=5)


class MemberIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    role: Literal["approver", "engineer", "viewer"]


class ReleaseIn(BaseModel):
    version: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9._\-+]+$")
    commit: str = Field(pattern=r"^[0-9a-fA-F]{7,64}$")
    branch: str = Field(default="main", max_length=80)
    notes: str = Field(default="", max_length=1000)


class EvidenceIn(BaseModel):
    type: str
    title: str = Field(min_length=2, max_length=120)
    payload: Dict[str, Any]
    source_uri: Optional[str] = Field(default=None, max_length=300)

    @field_validator("payload")
    @classmethod
    def size(cls, v):
        if len(str(v)) > 20000:
            raise ValueError("payload too large (max ~20KB). Store large artifacts externally and hash them.")
        return v


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str = Field(default="", max_length=500)


class HashIn(BaseModel):
    payload: Any


class ContentVerifyIn(BaseModel):
    payload: Dict[str, Any]


@router.get("/projects")
async def list_projects(user=Depends(current_user)):
    q = {} if user.get("role") == "admin" else {"$or": [{"members.user_id": user["_id"]}, {"is_demo": True}]}
    items = []
    for p in await db.projects.find(q).sort("created_at", -1).to_list(200):
        d = out(p)
        d["release_count"] = await db.releases.count_documents({"project_id": p["_id"]})
        d["deployment_count"] = await db.deployments.count_documents({"project_id": p["_id"]})
        d["open_incidents"] = await db.incidents.count_documents({"project_id": p["_id"], "status": {"$ne": "RESOLVED"}})
        items.append(d)
    return items


@router.post("/projects")
async def create_project(body: ProjectIn, user=Depends(current_user)):
    return out(await wf.create_project(user, body.name.strip(), body.description, body.repository.strip(),
                                       body.required_approvals))


@router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(current_user)):
    p, role = await project_access(pid, user)
    return {**out(p), "my_role": role}


@router.post("/projects/{pid}/members")
async def add_member(pid: str, body: MemberIn, user=Depends(current_user)):
    p, _ = await project_access(pid, user, ("owner",))
    if p.get("is_demo"):
        raise HTTPException(403, "Demo project membership is fixed")
    u = await db.users.find_one({"email": body.email.lower()})
    if not u:
        raise HTTPException(404, "No user with that email. They must register first.")
    if any(m["user_id"] == u["_id"] for m in p["members"]):
        raise HTTPException(409, "User is already a member")
    await db.projects.update_one({"_id": pid}, {"$push": {"members": {"user_id": u["_id"], "role": body.role,
                                                                       "name": u["name"], "email": u["email"]}}})
    return out(await db.projects.find_one({"_id": pid}))


@router.get("/projects/{pid}/releases")
async def list_releases(pid: str, user=Depends(current_user), limit: int = Query(50, le=200)):
    await project_access(pid, user)
    return outs(await db.releases.find({"project_id": pid}, {"manifest": 0}).sort("created_at", -1).to_list(limit))


@router.post("/projects/{pid}/releases")
async def create_release(pid: str, body: ReleaseIn, user=Depends(current_user)):
    p, _ = await project_access(pid, user, WRITE_ROLES)
    return out(await wf.create_release(p, user["email"], body.version, body.commit, body.branch, body.notes))


@router.get("/releases/{rid}")
async def get_release(rid: str, user=Depends(current_user)):
    r, p, role = await load("releases", rid, user)
    att = await db.attestations.find_one({"release_id": rid})
    return {**out(r), "project": {"id": p["_id"], "name": p["name"], "required_approvals": p["required_approvals"],
                                  "is_demo": p.get("is_demo")},
            "my_role": role,
            "evidence": outs(await db.evidence.find({"release_id": rid}, {"demo_original_payload": 0}).to_list(200)),
            "approvals": outs(await db.approvals.find({"release_id": rid}).to_list(50)),
            "attestation": out(att),
            "deployments": outs(await db.deployments.find({"release_id": rid}, {"comparisons": 0}).to_list(50)),
            "required_evidence": wf.REQUIRED_EVIDENCE, "evidence_types": wf.EVIDENCE_TYPES}


@router.post("/releases/{rid}/evidence")
async def add_evidence(rid: str, body: EvidenceIn, user=Depends(current_user)):
    r, _, _ = await load("releases", rid, user, WRITE_ROLES)
    ev = await wf.add_evidence(r, user["email"], body.type, body.title, body.payload, body.source_uri)
    return out(ev)


@router.post("/releases/{rid}/seal")
async def seal(rid: str, user=Depends(current_user)):
    r, p, _ = await load("releases", rid, user, WRITE_ROLES)
    mh = await wf.seal_release(r, user["email"])
    await refresh_findings(p["_id"])
    return {"manifest_hash": mh}


@router.post("/releases/{rid}/review")
async def review(rid: str, body: ReviewIn, user=Depends(current_user)):
    r, p, _ = await load("releases", rid, user, APPROVE_ROLES)
    a = await wf.approve_release(r, p, user, body.decision, body.comment)
    await refresh_findings(p["_id"])
    return out(a)


@router.post("/releases/{rid}/attest")
async def attest(rid: str, user=Depends(current_user)):
    r, p, _ = await load("releases", rid, user, APPROVE_ROLES)
    att = await wf.attest_release(r, user["email"])
    await refresh_findings(p["_id"])
    return out(att)


@router.get("/evidence/{eid}")
async def get_evidence(eid: str, user=Depends(current_user)):
    e, _, _ = await load("evidence", eid, user)
    d = out(e)
    d.pop("demo_original_payload", None)
    d["canonical_form"] = canonicalize(e["payload"]).decode()
    d["release"] = out(await db.releases.find_one({"_id": e["release_id"]}, {"manifest": 0}))
    return d


@router.post("/evidence/{eid}/verify")
async def verify_ev(eid: str, user=Depends(current_user)):
    e, p, _ = await load("evidence", eid, user)
    res = await wf.verify_evidence(e, user["email"])
    await refresh_findings(p["_id"])
    return res


@router.post("/evidence/{eid}/verify-content")
async def verify_content(eid: str, body: ContentVerifyIn, user=Depends(current_user)):
    e, _, _ = await load("evidence", eid, user)
    try:
        h = hash_obj(body.payload)
    except CanonicalizationError as ex:
        raise HTTPException(422, str(ex))
    return {"recorded_hash": e["hash"], "submitted_hash": h, "match": h == e["hash"]}


@router.get("/attestations/{aid}/verify")
async def verify_att(aid: str, user=Depends(current_user)):
    a, _, _ = await load("attestations", aid, user)
    return await verify_attestation(a)


@router.post("/tools/hash")
async def tool_hash(body: HashIn, user=Depends(current_user)):
    try:
        canon = canonicalize(body.payload)
    except CanonicalizationError as e:
        raise HTTPException(422, str(e))
    return {"canonicalization": CANON_VERSION, "canonical": canon.decode(), "hash": hash_obj(body.payload),
            "bytes": len(canon)}
