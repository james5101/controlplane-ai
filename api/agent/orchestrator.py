"""
Bootstrap Agent Orchestrator

Five-step pipeline:
  1. Intent Parser      — NL → structured intent (stack, cloud, resources, environments, CI)
  2. Config Hydrator    — loads org conventions from the database
  3. Scaffold Planner   — intent + org config → annotated file manifest (what files, why)
  4. Generator          — manifest → file content, generated in dependency-ordered batches
  5. Runbook Generator  — synthesises RUNBOOK.md from the generated file tree
  6. GitHub Pusher      — creates repo, single commit (all files + RUNBOOK.md), opens PR
"""

from api.agent.intent_parser import parse_intent
from api.agent.config_hydrator import hydrate_config, is_config_thin
from api.agent.scaffold_planner import plan_scaffold
from api.agent.generator import generate_scaffold
from api.agent.runbook_generator import generate_runbook
from api.agent.github_pusher import push_to_github


async def _maybe_auto_analyze(hydrated: dict, github_token: str) -> dict:
    """If the org config is thin and reference_repos are configured, run the
    analyzer and merge the result back into the hydrated config. Returns the
    (possibly updated) hydrated dict."""
    org_config = hydrated["org_config"]
    reference_repos = org_config.get("reference_repos") or []
    if not reference_repos or not is_config_thin(org_config):
        return hydrated

    from api.agent.repo_analyzer import analyze_repos
    result = await analyze_repos(repo_urls=reference_repos, github_token=github_token)
    inferred = result.get("inferred_config", {})
    if not inferred:
        return hydrated

    # Merge inferred values — only fill gaps, don't overwrite explicit settings
    merged = {**inferred, **{k: v for k, v in org_config.items() if v}}
    merged["reference_repos"] = reference_repos  # always preserve
    hydrated["org_config"] = merged
    # Rebuild params with merged config
    from api.agent.config_hydrator import _build_repo_name, _build_environment_config
    intent = hydrated["intent"]
    hydrated["params"] = {
        "org": merged.get("org", "my-org"),
        "repo_name": _build_repo_name(intent, merged),
        "service_name": intent.get("repo_name_hint", "my-service"),
        "environments": intent.get("environments", ["dev", "prod"]),
        "iac_version": merged.get("iac_version") or merged.get("terraform_version", "1.9.0"),
        "naming": merged.get("naming", {}),
        "security": merged.get("security", {}),
        "modules": merged.get("modules", {}),
        "environment_config": _build_environment_config(
            merged.get("environments", {}),
            intent.get("environments", ["dev", "prod"]),
        ),
        "required_tags": merged.get("required_tags", {"ManagedBy": "controlplane-ai"}),
    }
    return hydrated


async def stream_bootstrap_agent(org_id: str, github_token: str, request: str):
    try:
        yield {"step": "intent_parser", "status": "running"}
        intent = await parse_intent(request)
        intent["original_request"] = request
        yield {"step": "intent_parser", "status": "done", "output": intent}

        yield {"step": "config_hydrator", "status": "running"}
        hydrated = await hydrate_config(org_id=org_id, intent=intent)

        reference_repos = hydrated["org_config"].get("reference_repos") or []
        if reference_repos and is_config_thin(hydrated["org_config"]):
            yield {"step": "config_hydrator", "status": "done"}
            yield {
                "step": "repo_analyzer",
                "status": "running",
                "repos": reference_repos,
            }
            hydrated = await _maybe_auto_analyze(hydrated, github_token)
            yield {"step": "repo_analyzer", "status": "done"}
        else:
            yield {"step": "config_hydrator", "status": "done"}

        yield {"step": "scaffold_planner", "status": "running"}
        manifest = await plan_scaffold(hydrated)
        yield {
            "step": "scaffold_planner",
            "status": "done",
            "output": {
                "files": len(manifest),
                "groups": list({f["group"] for f in manifest}),
            },
        }

        yield {"step": "generator", "status": "running"}
        file_tree = await generate_scaffold(hydrated, manifest)
        yield {
            "step": "generator",
            "status": "done",
            "output": {"files": list(file_tree.keys())},
        }

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

    intent = await parse_intent(request)
    intent["original_request"] = request
    steps.append({"step": "intent_parser", "output": intent})

    hydrated = await hydrate_config(org_id=org_id, intent=intent)
    hydrated = await _maybe_auto_analyze(hydrated, github_token)
    steps.append({"step": "config_hydrator", "output": {}})

    manifest = await plan_scaffold(hydrated)
    steps.append({
        "step": "scaffold_planner",
        "output": {"files": len(manifest), "groups": list({f["group"] for f in manifest})},
    })

    file_tree = await generate_scaffold(hydrated, manifest)
    steps.append({"step": "generator", "output": {"files": list(file_tree.keys())}})

    runbook_md = await generate_runbook(hydrated, file_tree)
    file_tree["RUNBOOK.md"] = runbook_md
    steps.append({"step": "runbook_generator", "output": {"file": "RUNBOOK.md"}})

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
