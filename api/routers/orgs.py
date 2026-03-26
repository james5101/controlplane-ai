import json
import logging

import yaml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.db.connection import get_pool
from api.agent.config_hydrator import DEFAULT_ORG_CONFIG
from api.agent.repo_analyzer import analyze_repos as _analyze_repos, stream_analyze_repos as _stream_analyze_repos
from api.auth_utils import require_workspace

logger = logging.getLogger(__name__)
router = APIRouter()


class OrgConfigPayload(BaseModel):
    config_yaml: str  # raw YAML string from the editor


class AnalyzeReposRequest(BaseModel):
    repo_urls: list[str]


@router.get("/config")
async def get_org_config(user: dict = Depends(require_workspace)):
    """Return the org's config as a YAML string. Falls back to defaults if not set."""
    org_id = user["active_workspace"]
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT config FROM org_configs WHERE org_id = $1", org_id
    )
    config = json.loads(row["config"]) if row else DEFAULT_ORG_CONFIG
    return {"org_id": org_id, "config_yaml": yaml.dump(config, sort_keys=False)}


@router.put("/config")
async def update_org_config(
    payload: OrgConfigPayload,
    user: dict = Depends(require_workspace),
):
    """Parse, validate, and persist the org's config YAML."""
    org_id = user["active_workspace"]
    try:
        config = yaml.safe_load(payload.config_yaml)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=422, detail=f"Invalid YAML: {e}")

    if not isinstance(config, dict):
        raise HTTPException(status_code=422, detail="Config must be a YAML object")

    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO org_configs (org_id, config, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (org_id) DO UPDATE
            SET config = $2::jsonb, updated_at = NOW()
        """,
        org_id,
        json.dumps(config),
    )
    logger.info("Updated config for org %s", org_id)
    return {"org_id": org_id, "status": "saved"}


@router.post("/analyze-repos")
async def analyze_repos(
    payload: AnalyzeReposRequest,
    user: dict = Depends(require_workspace),
):
    """
    Fetch key files from the provided GitHub repos and use Claude to extract
    the org's infrastructure conventions into a .controlplane.yaml-compatible config.
    """
    token = user["github_token"]
    if not payload.repo_urls:
        raise HTTPException(status_code=422, detail="At least one repo URL is required")

    try:
        result = await _analyze_repos(payload.repo_urls, token)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Unexpected error in repo analyzer")
        raise HTTPException(status_code=500, detail="Internal server error")

    return result


@router.post("/analyze-repos/stream")
async def analyze_repos_stream(
    payload: AnalyzeReposRequest,
    user: dict = Depends(require_workspace),
):
    token = user["github_token"]
    if not payload.repo_urls:
        raise HTTPException(status_code=422, detail="At least one repo URL is required")

    async def event_stream():
        async for event in _stream_analyze_repos(payload.repo_urls, token):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
