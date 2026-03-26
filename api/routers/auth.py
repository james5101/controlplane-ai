"""
GitHub OAuth authentication router for ControlPlane AI.

NOTE: Your GitHub OAuth App must have the following callback URL configured:
  http://localhost:8000/auth/github/callback
  (or whatever GITHUB_OAUTH_CALLBACK_URL is set to in production)
"""

import os
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from api.auth_utils import create_session_token, get_current_user
from api.db.connection import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"


def _client_id() -> str:
    return os.environ.get("GITHUB_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("GITHUB_CLIENT_SECRET", "")


def _callback_url() -> str:
    return os.environ.get(
        "GITHUB_OAUTH_CALLBACK_URL", "http://localhost:8000/auth/github/callback"
    )


def _frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


class WorkspaceRequest(BaseModel):
    workspace: str


@router.get("/github")
async def github_oauth():
    """Redirect the browser to GitHub's OAuth authorization page."""
    scope = "read:user,user:email,read:org,repo"
    url = (
        f"{GITHUB_AUTHORIZE_URL}"
        f"?client_id={_client_id()}"
        f"&redirect_uri={_callback_url()}"
        f"&scope={scope}"
    )
    return RedirectResponse(url=url)


@router.get("/github/callback")
async def github_callback(code: str):
    """
    Handle GitHub OAuth callback:
    1. Exchange code for access token
    2. Fetch GitHub user info (and email if not public)
    3. Upsert user in DB
    4. Create JWT session cookie
    5. Redirect to workspace picker
    """
    async with httpx.AsyncClient() as client:
        # Step 1: Exchange code for access token
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "code": code,
                "redirect_uri": _callback_url(),
            },
            headers={"Accept": "application/json"},
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()

        access_token = token_data.get("access_token")
        if not access_token:
            logger.error("GitHub token exchange failed: %s", token_data)
            raise HTTPException(
                status_code=400,
                detail=token_data.get("error_description", "Failed to obtain access token"),
            )

        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }

        # Step 2: Fetch GitHub user info
        user_resp = await client.get(f"{GITHUB_API_URL}/user", headers=auth_headers)
        user_resp.raise_for_status()
        gh_user = user_resp.json()

        # Step 3: Fetch primary email if not public
        email = gh_user.get("email")
        if not email:
            emails_resp = await client.get(
                f"{GITHUB_API_URL}/user/emails", headers=auth_headers
            )
            if emails_resp.status_code == 200:
                for entry in emails_resp.json():
                    if entry.get("primary") and entry.get("verified"):
                        email = entry.get("email")
                        break

    # Step 4: Upsert user in DB
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO users (github_id, github_login, email, avatar_url, github_token, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (github_id) DO UPDATE
            SET github_login = EXCLUDED.github_login,
                email        = EXCLUDED.email,
                avatar_url   = EXCLUDED.avatar_url,
                github_token = EXCLUDED.github_token,
                updated_at   = NOW()
        RETURNING id, github_id, github_login, email, avatar_url, github_token
        """,
        gh_user["id"],
        gh_user["login"],
        email,
        gh_user.get("avatar_url"),
        access_token,
    )

    user = dict(row)

    # Step 5: Create JWT (no workspace selected yet)
    session_token = create_session_token(user, active_workspace=None)

    # Step 6 & 7: Set cookie and redirect to workspace picker
    redirect_url = f"{_frontend_url()}/auth/workspace"
    response = RedirectResponse(url=redirect_url)
    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=86400,
    )
    return response


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user's info."""
    return {
        "user_id": user["user_id"],
        "github_login": user["github_login"],
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "active_workspace": user.get("active_workspace"),
    }


@router.get("/workspaces")
async def get_workspaces(user: dict = Depends(get_current_user)):
    """
    Return the user's personal account and all GitHub orgs they belong to.
    """
    github_token = user["github_token"]
    auth_headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
    }

    async with httpx.AsyncClient() as client:
        orgs_resp = await client.get(
            f"{GITHUB_API_URL}/user/orgs", headers=auth_headers
        )
        orgs_resp.raise_for_status()
        orgs_data = orgs_resp.json()

    personal = {
        "login": user["github_login"],
        "avatar_url": user.get("avatar_url", ""),
        "type": "personal",
    }

    orgs = [
        {
            "login": org["login"],
            "avatar_url": org.get("avatar_url", ""),
            "type": "org",
        }
        for org in orgs_data
    ]

    return {"personal": personal, "orgs": orgs}


@router.post("/workspace")
async def set_workspace(
    payload: WorkspaceRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Update the active workspace in the session JWT cookie.
    """
    # Re-create user dict that matches what create_session_token expects
    user_record = {
        "id": user["user_id"],
        "github_login": user["github_login"],
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "github_token": user["github_token"],
    }
    new_token = create_session_token(user_record, active_workspace=payload.workspace)

    response = JSONResponse({"active_workspace": payload.workspace})
    response.set_cookie(
        key="session",
        value=new_token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=86400,
    )
    return response


@router.post("/logout")
async def logout():
    """Delete the session cookie."""
    response = JSONResponse({"ok": True})
    response.delete_cookie(key="session", path="/")
    return response
