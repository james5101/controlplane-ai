import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.agent.orchestrator import run_bootstrap_agent, stream_bootstrap_agent
from api.auth_utils import require_workspace
from api.db.connection import get_pool

logger = logging.getLogger(__name__)

router = APIRouter()


class BootstrapRequest(BaseModel):
    request: str  # natural language input from developer


class BootstrapResponse(BaseModel):
    repo_url: str
    pr_url: str
    steps: list[dict]  # step-by-step trace for UI


async def _save_service(org_id: str, result: dict, intent: dict) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO bootstrapped_services
            (org_id, repo_name, repo_url, pr_url, cloud, service_type, environments, original_request)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        org_id,
        intent.get("repo_name_hint", "unknown"),
        result["repo_url"],
        result["pr_url"],
        intent.get("cloud"),
        intent.get("service_type"),
        intent.get("environments", []),
        intent.get("original_request"),
    )


@router.get("/")
async def list_services(user: dict = Depends(require_workspace)):
    """Return all services bootstrapped for the active workspace."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, repo_name, repo_url, pr_url, cloud, service_type, environments, original_request, created_at
        FROM bootstrapped_services
        WHERE org_id = $1
        ORDER BY created_at DESC
        """,
        user["active_workspace"],
    )
    return [
        {
            "id": r["id"],
            "repo_name": r["repo_name"],
            "repo_url": r["repo_url"],
            "pr_url": r["pr_url"],
            "cloud": r["cloud"],
            "service_type": r["service_type"],
            "environments": r["environments"],
            "original_request": r["original_request"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


@router.post("/bootstrap", response_model=BootstrapResponse)
async def bootstrap_service(
    payload: BootstrapRequest,
    user: dict = Depends(require_workspace),
):
    try:
        result = await run_bootstrap_agent(
            org_id=user["active_workspace"],
            github_token=user["github_token"],
            request=payload.request,
        )
    except RuntimeError as e:
        logger.error("Bootstrap agent failed: %s", e)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in bootstrap agent")
        raise HTTPException(status_code=500, detail="Internal server error")

    # Persist to catalog
    intent = next(
        (s["output"] for s in result["steps"] if s["step"] == "intent_parser"),
        {},
    )
    try:
        await _save_service(user["active_workspace"], result, intent)
    except Exception:
        logger.exception("Failed to save service to catalog")

    return result


@router.post("/bootstrap/stream")
async def bootstrap_stream(
    payload: BootstrapRequest,
    user: dict = Depends(require_workspace),
):
    org_id = user["active_workspace"]

    async def event_stream():
        intent: dict = {}
        async for event in stream_bootstrap_agent(
            org_id=org_id,
            github_token=user["github_token"],
            request=payload.request,
        ):
            # Capture intent for catalog write
            if event.get("step") == "intent_parser" and event.get("status") == "done":
                intent = event.get("output", {})

            yield f"data: {json.dumps(event)}\n\n"

            # Write to catalog once the pipeline completes
            if event.get("step") == "complete":
                try:
                    await _save_service(org_id, event, intent)
                except Exception:
                    logger.exception("Failed to save service to catalog")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
