"""
Bootstrap Agent Orchestrator

Runs the multi-step agent pipeline:
  1. Intent Parser      — extract structured intent from natural language
  2. Config Hydrator    — apply org conventions from the database
  3. Generator          — render the full file tree
  4. Runbook Generator  — generate RUNBOOK.md, injected into the file tree
  5. GitHub Pusher      — create repo, commit scaffold + runbook, open PR
"""

from api.agent.intent_parser import parse_intent
from api.agent.config_hydrator import hydrate_config
from api.agent.generator import generate_scaffold
from api.agent.runbook_generator import generate_runbook
from api.agent.github_pusher import push_to_github


async def stream_bootstrap_agent(org_id: str, github_token: str, request: str):
    try:
        yield {"step": "intent_parser", "status": "running"}
        intent = await parse_intent(request)
        intent["original_request"] = request
        yield {"step": "intent_parser", "status": "done", "output": intent}

        yield {"step": "config_hydrator", "status": "running"}
        hydrated = await hydrate_config(org_id=org_id, intent=intent)
        yield {"step": "config_hydrator", "status": "done"}

        yield {"step": "generator", "status": "running"}
        file_tree = await generate_scaffold(hydrated)
        yield {"step": "generator", "status": "done", "output": {"files": list(file_tree.keys())}}

        yield {"step": "runbook_generator", "status": "running"}
        runbook_md = await generate_runbook(hydrated, file_tree)
        file_tree["RUNBOOK.md"] = runbook_md
        yield {"step": "runbook_generator", "status": "done"}

        yield {"step": "github_pusher", "status": "running"}
        result = await push_to_github(
            org_id=org_id,
            intent=intent,
            file_tree=file_tree,
            github_token=github_token,
            github_org_login=org_id,
        )
        yield {"step": "github_pusher", "status": "done"}

        yield {
            "step": "complete",
            "repo_url": result["repo_url"],
            "pr_url": result["pr_url"],
            "runbook_md": runbook_md,
        }
    except Exception as e:
        yield {"step": "error", "message": str(e)}


async def run_bootstrap_agent(org_id: str, github_token: str, request: str) -> dict:
    steps = []

    # Step 1: Parse intent
    intent = await parse_intent(request)
    intent["original_request"] = request
    steps.append({"step": "intent_parser", "output": intent})

    # Step 2: Hydrate with org config
    hydrated = await hydrate_config(org_id=org_id, intent=intent)
    steps.append({"step": "config_hydrator", "output": hydrated})

    # Step 3: Generate scaffold
    file_tree = await generate_scaffold(hydrated)
    steps.append({"step": "generator", "output": {"files": list(file_tree.keys())}})

    # Step 4: Generate runbook — injected into file_tree before push
    runbook_md = await generate_runbook(hydrated, file_tree)
    file_tree["RUNBOOK.md"] = runbook_md
    steps.append({"step": "runbook_generator", "output": {"file": "RUNBOOK.md"}})

    # Step 5: Push to GitHub (includes RUNBOOK.md in the same commit)
    result = await push_to_github(
        org_id=org_id,
        intent=intent,
        file_tree=file_tree,
        github_token=github_token,
        github_org_login=org_id,
    )
    steps.append({"step": "github_pusher", "output": result})

    return {
        "repo_url": result["repo_url"],
        "pr_url": result["pr_url"],
        "runbook_md": runbook_md,
        "steps": steps,
    }
