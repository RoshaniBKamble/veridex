import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from .core import DEMO_PROJECT_ID, db, new_id, now, out

router = APIRouter(prefix="/api/auth", tags=["auth"])
ALG = "HS256"
TOKEN_HOURS = 12
MAX_ATTEMPTS = 5
LOCK_MINUTES = 15

WRITE_ROLES = ("owner", "approver", "engineer")
APPROVE_ROLES = ("owner", "approver")


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def make_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=ALG)


def public_user(u: dict) -> dict:
    return {"id": u["_id"], "email": u["email"], "name": u["name"], "role": u.get("role", "member")}


async def current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def project_access(project_id: str, user: dict, roles=None):
    p = await db.projects.find_one({"_id": project_id})
    if not p:
        raise HTTPException(404, "Project not found")
    member = next((m for m in p.get("members", []) if m["user_id"] == user["_id"]), None)
    if member:
        role = member["role"]
    elif user.get("role") == "admin":
        role = "owner"
    elif p.get("is_demo"):
        role = "approver"
    else:
        raise HTTPException(404, "Project not found")
    if roles and role not in roles:
        raise HTTPException(403, f"Role '{role}' cannot perform this action")
    return p, role


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def _session(resp: Response, user: dict) -> dict:
    token = make_token(user["_id"], user["email"])
    resp.set_cookie("access_token", token, httponly=True, secure=True, samesite="none",
                    max_age=TOKEN_HOURS * 3600, path="/")
    return {"user": public_user(user), "access_token": token}


@router.post("/register")
async def register(body: RegisterIn, resp: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")
    user = {"_id": new_id("usr"), "email": email, "name": body.name.strip(),
            "password_hash": hash_password(body.password), "role": "member", "created_at": now()}
    await db.users.insert_one(user)
    return _session(resp, user)


@router.post("/login")
async def login(body: LoginIn, request: Request, resp: Response):
    email = body.email.lower()
    ident = f"{request.client.host if request.client else 'na'}:{email}"
    att = await db.login_attempts.find_one({"_id": ident})
    if att and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (att or {}).get("count", 0) + 1
        update = {"count": count}
        if count >= MAX_ATTEMPTS:
            update = {"count": 0, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)).isoformat()}
        await db.login_attempts.update_one({"_id": ident}, {"$set": update}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"_id": ident})
    return _session(resp, user)


@router.post("/logout")
async def logout(resp: Response):
    resp.delete_cookie("access_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(current_user)):
    return public_user(user)


async def seed_admin():
    email, pw = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"_id": new_id("usr"), "email": email, "name": "VERIDEX Admin",
                                   "password_hash": hash_password(pw), "role": "admin", "created_at": now()})
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {"password_hash": hash_password(pw)}})


__all__ = ["router", "current_user", "project_access", "seed_admin", "WRITE_ROLES", "APPROVE_ROLES",
           "DEMO_PROJECT_ID", "out"]
