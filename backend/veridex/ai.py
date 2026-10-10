"""Optional AI investigation layer (Claude via emergentintegrations) + deterministic analysis fallback."""
import json
import os

from .core import db, new_id, now

MODEL = ("anthropic", "claude-sonnet-4-5-20250929")
SYSTEM = (
    "You are the VERIDEX investigation assistant for Web3 release integrity incidents. "
    "Use ONLY the JSON records provided. Structure your answer with these headings: "
    "'Observed facts', 'Why it matters', 'Hypotheses (unverified)', 'Investigate next', 'Uncertainty'. "
    "Clearly separate facts from hypotheses. Never claim an attack occurred, never claim code is safe, "
    "never recommend approving or re-baselining automatically. If records are marked simulated, say so. Be concise."
)


def ai_configured() -> bool:
    return bool(os.environ.get("EMERGENT_LLM_KEY"))


async def incident_context(inc: dict) -> dict:
    dep = await db.deployments.find_one({"_id": inc["deployment_id"]}) or {}
    rel = await db.releases.find_one({"_id": inc["release_id"]}) or {}
    drifts = await db.drift_events.find({"_id": {"$in": inc["drift_event_ids"]}}, {"dedup_key": 0}).to_list(50)
    return {
        "incident": {k: inc.get(k) for k in ("number", "severity", "status", "title", "summary", "simulated", "created_at")},
        "release": {k: rel.get(k) for k in ("version", "commit", "status", "manifest_hash")},
        "deployment": {k: dep.get(k) for k in ("label", "network", "address", "verification_status", "last_block_ref")},
        "expected_state_version": (dep.get("expected") or {}).get("version"),
        "drift_events": [{k: d.get(k) for k in ("field", "expected", "observed", "severity", "source", "simulated")} for d in drifts],
        "comparisons": [{k: c.get(k) for k in ("field", "status", "expected", "observed")} for c in dep.get("comparisons", [])],
    }


def deterministic_analysis(ctx: dict) -> dict:
    facts = [f"{d['field']}: expected {d['expected']} but observed {d['observed']} (source: {d['source']})"
             for d in ctx["drift_events"]]
    matched = [c["field"] for c in ctx["comparisons"] if c["status"] == "MATCH"]
    unverifiable = [c["field"] for c in ctx["comparisons"] if c["status"] in ("UNAVAILABLE", "UNSUPPORTED")]
    fields = {d["field"] for d in ctx["drift_events"]}
    steps = []
    if fields & {"implementation", "implementation_code_hash", "code_hash"}:
        steps.append("Fetch the newly observed implementation bytecode and compare it to the approved build artifact hash.")
        steps.append("Locate the upgrade transaction (Upgraded event / admin call) and identify the signer.")
    if fields & {"proxy_admin", "owner", "upgrade_authority"}:
        steps.append("Confirm with key holders whether the privileged authority change was authorised (multisig/governance records).")
    if "release_attestation" in fields:
        steps.append("Inspect evidence items whose recomputed hash no longer matches the attested hash.")
    steps.append("Pause further releases until the expected state is either restored or re-approved and re-baselined.")
    return {"kind": "DETERMINISTIC", "facts": facts, "still_matching": matched, "not_verifiable": unverifiable,
            "investigation_steps": steps,
            "limitations": "Rule-based summary from VERIDEX records. It does not determine intent or prove compromise."
            + (" Records are SIMULATED demo state." if ctx["incident"].get("simulated") else "")}


async def stream_explanation(inc: dict):
    from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
    ctx = await incident_context(inc)
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"veridex-{inc['_id']}-{new_id('s')}",
                   system_message=SYSTEM).with_model(*MODEL)
    text = ""
    async for ev in chat.stream_message(UserMessage(text="Records:\n" + json.dumps(ctx, indent=1))):
        if isinstance(ev, TextDelta):
            text += ev.content
            yield ev.content
        elif isinstance(ev, StreamDone):
            break
    await db.ai_explanations.insert_one({"_id": new_id("aix"), "incident_id": inc["_id"], "project_id": inc["project_id"],
                                         "model": f"{MODEL[0]}/{MODEL[1]}", "text": text, "created_at": now(),
                                         "label": "AI-GENERATED (hypothesis, not a verification result)"})
