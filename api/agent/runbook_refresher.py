"""
Runbook Refresher

Standalone agent triggered on-demand from the catalog. Fetches the current
state of the bootstrapped repo from GitHub, re-generates the runbook against
the latest files and current org config, commits RUNBOOK.md to a new branch,
and opens a PR.

Used by POST /services/{id}/runbook/regenerate.
"""

import re
from datetime import datetime, timezone

from github import Github, GithubException, InputGitTreeElement

from api.agent.runbook_generator import generate_runbook
from api.agent.config_hydrator import _fetch_org_config

_RELEVANT_FILES = [
    "main.tf",
    "variables.tf",
    "outputs.tf",
    ".github/workflows/deploy.yml",
    ".github/workflows/ci.yml",
    "cloudbuild.yaml",
    ".gitlab-ci.yml",
]


def _parse_repo_url(repo_url: str) -> tuple[str, str]:
    """Extract owner and repo name from a GitHub HTML URL."""
    match = re.search(r"github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
    if not match:
        raise ValueError(f"Cannot parse repo URL: {repo_url}")
    return match.group(1), match.group(2)


def _fetch_repo_files(repo, relevant_paths: list[str]) -> dict[str, str]:
    """Fetch relevant files from the repo's default branch."""
    file_tree = {}
    try:
        contents = repo.get_contents("")
        all_paths = []
        # Shallow scan — get top-level and one level deep
        while contents:
            item = contents.pop(0)
            if item.type == "dir":
                try:
                    contents.extend(repo.get_contents(item.path))
                except GithubException:
                    pass
            else:
                all_paths.append(item)

        for item in all_paths:
            if any(item.path.endswith(rel.split("/")[-1]) or item.path == rel for rel in relevant_paths):
                try:
                    file_tree[item.path] = item.decoded_content.decode("utf-8")
                except Exception:
                    pass
    except GithubException:
        pass
    return file_tree


async def refresh_runbook(service: dict, github_token: str) -> dict:
    """
    Re-generate the runbook for a bootstrapped service and open a PR.

    Args:
        service: Row from bootstrapped_services (dict with repo_url, org_id, etc.)
        github_token: GitHub token for the authenticated user

    Returns:
        dict with pr_url and runbook_md
    """
    org_id = service["org_id"]
    repo_url = service["repo_url"]

    # Rebuild hydrated-like context from stored service fields + current org config
    org_config = await _fetch_org_config(org_id)

    intent = {
        "original_request": service.get("original_request", ""),
        "cloud": service.get("cloud", "unknown"),
        "service_type": service.get("service_type", "unknown"),
        "environments": service.get("environments") or ["dev", "prod"],
        "ci_provider": "github_actions",
        "repo_name_hint": service.get("repo_name", "unknown"),
    }

    hydrated = {
        "intent": intent,
        "org_config": org_config,
        "params": {
            "org": org_config.get("org", org_id),
            "repo_name": service.get("repo_name", "unknown"),
            "environments": intent["environments"],
            "iac_version": org_config.get("iac_version", "1.9.0"),
            "naming": org_config.get("naming", {}),
            "security": org_config.get("security", {}),
            "modules": org_config.get("modules", {}),
            "required_tags": org_config.get("required_tags", {}),
        },
    }

    # Fetch current repo files from GitHub
    gh = Github(github_token)
    owner, repo_name = _parse_repo_url(repo_url)
    try:
        repo = gh.get_repo(f"{owner}/{repo_name}")
    except GithubException as e:
        raise RuntimeError(f"Cannot access repo {repo_url}: {e}")

    file_tree = _fetch_repo_files(repo, _RELEVANT_FILES)

    # Re-generate runbook
    runbook_md = await generate_runbook(hydrated, file_tree)

    # Commit to a new branch and open a PR
    default_branch = repo.get_branch(repo.default_branch)
    base_sha = default_branch.commit.sha
    base_tree = repo.get_git_commit(base_sha).tree

    tree_elements = [
        InputGitTreeElement(
            path="RUNBOOK.md",
            mode="100644",
            type="blob",
            content=runbook_md,
        )
    ]

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    branch_name = f"controlplane/runbook-refresh-{timestamp}"

    new_tree = repo.create_git_tree(tree_elements, base_tree)
    new_commit = repo.create_git_commit(
        message="docs: refresh RUNBOOK.md (ControlPlane AI)",
        tree=new_tree,
        parents=[repo.get_git_commit(base_sha)],
    )
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=new_commit.sha)

    pr = repo.create_pull(
        title="docs: refresh RUNBOOK.md (ControlPlane AI)",
        body=(
            "This PR refreshes the operational runbook to reflect the current "
            "state of the repository and org conventions.\n\n"
            "Generated by **ControlPlane AI**."
        ),
        head=branch_name,
        base=repo.default_branch,
    )

    return {"pr_url": pr.html_url, "runbook_md": runbook_md}
