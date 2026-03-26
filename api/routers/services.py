import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.agent.orchestrator import run_bootstrap_agent, stream_bootstrap_agent
from api.agent.runbook_refresher import refresh_runbook
from api.auth_utils import require_workspace
from api.db.connection import get_pool

logger = logging.getLogger(__name__)

router = APIRouter()

RUNBOOK_STALE_COMMITS = 5
RUNBOOK_STALE_DAYS = 30


class BootstrapRequest(BaseModel):
    request: str


class BootstrapResponse(BaseModel):
    repo_url: str
    pr_url: str
    steps: list[dict]


async def _save_service(org_id: str, result: dict, intent: dict, runbook_md: str | None = None) -> int:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO bootstrapped_services
            (org_id, repo_name, repo_url, pr_url, cloud, service_type,
             environments, original_request, runbook_md, runbook_generated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        """,
        org_id,
        intent.get("repo_name_hint", "unknown"),
        result["repo_url"],
        result["pr_url"],
        intent.get("cloud"),
        intent.get("service_type"),
        intent.get("environments", []),
        intent.get("original_request"),
        runbook_md,
        datetime.now(timezone.utc) if runbook_md else None,
    )
    return row["id"]


def _staleness(row: dict) -> dict:
    """Compute runbook staleness from stored metadata (no GitHub call on list)."""
    generated_at = row.get("runbook_generated_at")
    if not generated_at:
        return {"runbook_stale": None, "runbook_age_days": None}
    age_days = (datetime.now(timezone.utc) - generated_at).days
    return {
        "runbook_age_days": age_days,
        "runbook_stale": age_days >= RUNBOOK_STALE_DAYS,
    }


def _row_to_dict(r) -> dict:
    stale = _staleness(r)
    return {
        "id": r["id"],
        "repo_name": r["repo_name"],
        "repo_url": r["repo_url"],
        "pr_url": r["pr_url"],
        "cloud": r["cloud"],
        "service_type": r["service_type"],
        "environments": r["environments"],
        "original_request": r["original_request"],
        "runbook_md": r["runbook_md"],
        "runbook_generated_at": r["runbook_generated_at"].isoformat() if r["runbook_generated_at"] else None,
        "created_at": r["created_at"].isoformat(),
        **stale,
    }


@router.get("/")
async def list_services(user: dict = Depends(require_workspace)):
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, repo_name, repo_url, pr_url, cloud, service_type,
               environments, original_request, runbook_md,
               runbook_generated_at, created_at
        FROM bootstrapped_services
        WHERE org_id = $1
        ORDER BY created_at DESC
        """,
        user["active_workspace"],
    )
    return [_row_to_dict(r) for r in rows]


@router.get("/{service_id}")
async def get_service(service_id: int, user: dict = Depends(require_workspace)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, org_id, repo_name, repo_url, pr_url, cloud, service_type,
               environments, original_request, runbook_md,
               runbook_generated_at, created_at
        FROM bootstrapped_services
        WHERE id = $1 AND org_id = $2
        """,
        service_id,
        user["active_workspace"],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Service not found")

    result = _row_to_dict(row)

    # Check GitHub for commit count since runbook was last generated
    if row["runbook_generated_at"] and user.get("github_token"):
        result["commits_since_runbook"] = await _count_commits_since(
            row["repo_url"],
            row["runbook_generated_at"],
            user["github_token"],
        )
        # Override stale flag with commit-count check
        result["runbook_stale"] = (
            result["commits_since_runbook"] >= RUNBOOK_STALE_COMMITS
            or (result["runbook_age_days"] or 0) >= RUNBOOK_STALE_DAYS
        )
    else:
        result["commits_since_runbook"] = None

    return result


async def _count_commits_since(repo_url: str, since: datetime, github_token: str) -> int:
    """Return number of commits to the repo since `since`, capped at STALE_COMMITS+1."""
    import re
    from github import Github, GithubException

    match = re.search(r"github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
    if not match:
        return 0
    try:
        gh = Github(github_token)
        repo = gh.get_repo(f"{match.group(1)}/{match.group(2)}")
        commits = repo.get_commits(since=since)
        count = 0
        for _ in commits:
            count += 1
            if count > RUNBOOK_STALE_COMMITS:
                break
        return count
    except GithubException:
        return 0


@router.post("/{service_id}/runbook/regenerate")
async def regenerate_runbook(service_id: int, user: dict = Depends(require_workspace)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM bootstrapped_services WHERE id = $1 AND org_id = $2",
        service_id,
        user["active_workspace"],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Service not found")

    try:
        result = await refresh_runbook(dict(row), user["github_token"])
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Runbook refresh failed for service %s", service_id)
        raise HTTPException(status_code=500, detail="Runbook refresh failed")

    # Update DB record with fresh runbook
    await pool.execute(
        """
        UPDATE bootstrapped_services
        SET runbook_md = $1, runbook_generated_at = $2
        WHERE id = $3
        """,
        result["runbook_md"],
        datetime.now(timezone.utc),
        service_id,
    )

    return {"pr_url": result["pr_url"]}


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
    except Exception:
        logger.exception("Unexpected error in bootstrap agent")
        raise HTTPException(status_code=500, detail="Internal server error")

    intent = next(
        (s["output"] for s in result["steps"] if s["step"] == "intent_parser"),
        {},
    )
    try:
        await _save_service(
            user["active_workspace"], result, intent, result.get("runbook_md")
        )
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
        runbook_md: str | None = None

        async for event in stream_bootstrap_agent(
            org_id=org_id,
            github_token=user["github_token"],
            request=payload.request,
        ):
            if event.get("step") == "intent_parser" and event.get("status") == "done":
                intent = event.get("output", {})

            yield f"data: {json.dumps(event)}\n\n"

            if event.get("step") == "complete":
                runbook_md = event.get("runbook_md")
                try:
                    await _save_service(org_id, event, intent, runbook_md)
                except Exception:
                    logger.exception("Failed to save service to catalog")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
