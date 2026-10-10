import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from veridex import auth, routes_ops, routes_release, seed  # noqa: E402
from veridex.core import client, db, now  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("veridex")

app = FastAPI(title="VERIDEX API", version="0.1.0",
              description="Verify what you build. Prove what you deploy.", docs_url="/api/docs",
              openapi_url="/api/openapi.json")


@app.get("/api/health")
async def health():
    await db.command("ping")
    return {"status": "ok", "service": "veridex-api", "time": now()}


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(auth.router)
app.include_router(routes_release.router)
app.include_router(routes_ops.router)

origins = [o for o in {os.environ.get("FRONTEND_URL"), "http://localhost:3000"} if o]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.releases.create_index([("project_id", 1), ("version", 1)], unique=True)
    await db.evidence.create_index("release_id")
    await db.deployments.create_index("project_id")
    await db.drift_events.create_index("dedup_key")
    await db.findings.create_index("dedup_key", unique=True)
    await db.audit_events.create_index([("project_id", 1), ("created_at", -1)])
    await auth.seed_admin()
    try:
        await seed.seed_demo()
    except Exception:  # noqa: BLE001
        log.exception("Demo seed failed")


@app.on_event("shutdown")
async def shutdown():
    client.close()
