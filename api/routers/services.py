import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.agent.orchestrator import run_bootstrap_agent, stream_bootstrap_agent

logger = logging.getLogger(__name__)

router = APIRouter()


class BootstrapRequest(BaseModel):
    org_id: str
    request: str  # natural language input from developer


class BootstrapResponse(BaseModel):
    repo_url: str
    pr_url: str
    steps: list[dict]  # step-by-step trace for UI


@router.post("/bootstrap", response_model=BootstrapResponse)
async def bootstrap_service(payload: BootstrapRequest):
    """
    Core endpoint: takes a natural language request, runs the multi-step
    bootstrap agent, creates a GitHub repo with scaffold, opens a PR.
    """
    try:
        result = await run_bootstrap_agent(
            org_id=payload.org_id,
            request=payload.request,
        )
    except RuntimeError as e:
        logger.error("Bootstrap agent failed: %s", e)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in bootstrap agent")
        raise HTTPException(status_code=500, detail="Internal server error")
    return result


@router.post("/bootstrap/stream")
async def bootstrap_stream(payload: BootstrapRequest):
    async def event_stream():
        async for event in stream_bootstrap_agent(payload.org_id, payload.request):
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
