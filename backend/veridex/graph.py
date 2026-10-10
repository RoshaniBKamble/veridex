"""Trust Graph builder — every node is a stored record, every edge a stored relationship."""
from .chains import NETWORKS
from .core import db

EV_STATUS = {"VERIFIED": "ok", "FAILED": "critical"}
REL_STATUS = {"attested": "ok", "approved": "pending", "sealed": "pending", "draft": "pending", "rejected": "critical"}
DEP_STATUS = {"VERIFIED": "ok", "PARTIAL": "warn", "DRIFT": "critical", "UNAVAILABLE": "unknown"}
AUTH = {"owner", "proxy_admin", "upgrade_authority", "implementation"}
CODE = {"code_hash", "implementation_code_hash", "chain_id", "cluster", "executable", "loader", "last_deploy_slot"}


def _field_status(dep, fields):
    cs = [c for c in dep.get("comparisons", []) if c["field"] in fields]
    if any(c["status"] == "MISMATCH" for c in cs):
        return "critical"
    if cs and all(c["status"] == "MATCH" for c in cs):
        return "ok"
    return "unknown" if dep.get("verification_status") == "UNAVAILABLE" else "warn" if cs else "unknown"


async def build_graph(project_id: str) -> dict:
    p = await db.projects.find_one({"_id": project_id})
    nodes, edges, paths = [], [], []

    def node(nid, ntype, label, status, layer, link=None, sub=None, demo=False, ref=None):
        nodes.append({"id": nid, "type": ntype, "label": label, "sub": sub, "status": status, "layer": layer,
                      "link": link, "demo": demo, "ref": ref})

    def edge(a, b, rel):
        edges.append({"source": a, "target": b, "relation": rel})

    node("repo", "repository", p["repository"].split("/")[-1][:28] or "repository", "ok", 0, sub=p["repository"],
         demo=p.get("is_demo"))
    releases = await db.releases.find({"project_id": project_id}).sort("created_at", 1).to_list(50)
    deps = await db.deployments.find({"project_id": project_id}).to_list(100)
    for r in releases:
        rid = r["_id"]
        node(f"c:{rid}", "commit", r["commit"][:10], "ok", 1, sub=f"{r['branch']}@{r['commit'][:12]}")
        node(rid, "release", r["version"], REL_STATUS.get(r["status"], "unknown"), 2, f"/app/releases/{rid}",
             sub=r["status"].upper())
        edge("repo", f"c:{rid}", "contains")
        edge(f"c:{rid}", rid, "tagged_as")
        evs = await db.evidence.find({"release_id": rid}).to_list(50)
        art = f"m:{rid}"
        if r.get("manifest_hash"):
            node(art, "artifact", "Release manifest", "ok", 4, f"/app/releases/{rid}", sub=r["manifest_hash"][:23] + "…")
        for e in evs:
            node(e["_id"], e["type"], e["title"][:26], EV_STATUS.get(e.get("integrity_status"), "pending"), 3,
                 f"/app/evidence/{e['_id']}", sub=e["hash"][:23] + "…", demo=e.get("label") == "DEMO")
            edge(rid, e["_id"], "has_evidence")
            if r.get("manifest_hash"):
                edge(e["_id"], art, "hashed_into")
        tail = art if r.get("manifest_hash") else rid
        aps = await db.approvals.find({"release_id": rid}).to_list(20)
        for a in aps:
            node(a["_id"], "approval", a["approver_name"][:22], "ok" if a["decision"] == "approve" else "critical", 5,
                 f"/app/releases/{rid}", sub=a["decision"].upper())
            edge(tail, a["_id"], "reviewed_by")
        att = await db.attestations.find_one({"release_id": rid})
        if att:
            node(att["_id"], "attestation", "Ed25519 attestation", "ok", 6, f"/app/releases/{rid}",
                 sub=att["statement_hash"][:23] + "…")
            for a in aps or [{"_id": tail}]:
                edge(a["_id"], att["_id"], "attested_in")
        for d in [d for d in deps if d["release_id"] == rid]:
            did = d["_id"]
            demo = d.get("observation_mode") == "SIMULATED"
            dstat = DEP_STATUS.get(d.get("verification_status"), "pending")
            node(did, "deployment", d["label"][:28], dstat, 7, f"/app/deployments/{did}", sub=d["network"], demo=demo)
            edge(att["_id"] if att else rid, did, "deployed_as")
            net = f"n:{d['network']}"
            if not any(n["id"] == net for n in nodes):
                node(net, "blockchain", NETWORKS[d["network"]]["name"], "ok" if not demo else "ok", 8,
                     "/app/integrations", sub=d["network"], demo=NETWORKS[d["network"]]["family"] == "demo-evm")
            edge(did, net, "on_network")
            node(f"ct:{did}", "contract", d["address"][:10] + "…", _field_status(d, CODE), 9, f"/app/deployments/{did}",
                 sub=d["address"], demo=demo)
            edge(net, f"ct:{did}", "hosts")
            node(f"pm:{did}", "permissions", "Privileged authority", _field_status(d, AUTH), 10, "/app/permissions",
                 demo=demo)
            edge(f"ct:{did}", f"pm:{did}", "governed_by")
            node(f"pr:{did}", "production", "Production state", dstat, 11, f"/app/deployments/{did}",
                 sub=d.get("last_block_ref") or "never observed", demo=demo)
            edge(f"pm:{did}", f"pr:{did}", "observed_as")
            for inc in await db.incidents.find({"deployment_id": did}).to_list(20):
                st = "ok" if inc["status"] == "RESOLVED" else "critical"
                node(inc["_id"], "incident", inc["number"], st, 12, f"/app/incidents/{inc['_id']}",
                     sub=inc["status"], demo=inc.get("simulated"))
                edge(f"pr:{did}", inc["_id"], "raised")
                if inc["status"] != "RESOLVED":
                    paths.append({"incident_id": inc["_id"], "nodes": [rid, att["_id"] if att else rid, did, net,
                                                                       f"ct:{did}", f"pm:{did}", f"pr:{did}", inc["_id"]]})
    for e in edges:
        tgt = next((n for n in nodes if n["id"] == e["target"]), None)
        e["status"] = tgt["status"] if tgt else "unknown"
    return {"nodes": nodes, "edges": edges, "incident_paths": paths}
