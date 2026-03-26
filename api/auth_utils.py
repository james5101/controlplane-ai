"""
JWT utilities for ControlPlane AI session management.
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt


ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def _secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    return secret


def create_session_token(user: dict, active_workspace: str | None = None) -> str:
    """
    Sign a JWT with HS256 containing user info and optional active_workspace.
    Expires in 24 hours.
    """
    now = datetime.now(tz=timezone.utc)
    payload = {
        "user_id": user["id"],
        "github_login": user["github_login"],
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "github_token": user["github_token"],
        "active_workspace": active_workspace,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict:
    """
    Verify and decode the session JWT. Raises HTTPException(401) on failure.
    """
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {e}")


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency: reads the `session` cookie and returns the decoded user dict.
    Raises HTTPException(401) if the cookie is missing or invalid.
    """
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_session_token(token)


async def require_workspace(user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency: builds on get_current_user and additionally checks that
    active_workspace is set. Raises HTTPException(401) if not.
    """
    if not user.get("active_workspace"):
        raise HTTPException(status_code=401, detail="No workspace selected")
    return user
