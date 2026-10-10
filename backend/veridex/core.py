import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

DEMO_PROJECT_ID = "prj_demo_aurora"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def out(doc):
    """Map Mongo `_id` to `id` for API responses."""
    if not doc:
        return None
    d = dict(doc)
    d["id"] = d.pop("_id")
    d.pop("password_hash", None)
    return d


def outs(docs):
    return [out(d) for d in docs]


async def audit(project_id, actor, action, entity_type, entity_id, detail=None):
    await db.audit_events.insert_one({
        "_id": new_id("aud"),
        "project_id": project_id,
        "actor": actor,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "detail": detail or {},
        "created_at": now(),
    })


async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"value": 1}}, upsert=True, return_document=True
    )
    return doc["value"]
