"""
Repo Analyzer

Fetches key files from existing customer repos via the GitHub API and uses
Claude to extract their infrastructure conventions — naming patterns, required
tags, IaC tooling, module sources, environments, and CI/CD patterns — in a
cloud-agnostic way.
"""

import json
import logging

import anthropic
from github import Github, GithubException

logger = logging.getLogger(__name__)
client = anthropic.AsyncAnthropic()

MAX_FILE_CHARS = 3000
MAX_FILES_PER_REPO = 10
MAX_REPOS = 5


def _file_score(path: str) -> int:
    """Score a file path by how useful it is for convention extraction."""
    p = path.lower()
    if p.endswith("main.tf"):
        return 10
    if p.endswith("variables.tf"):
        return 9
    if p.endswith(".tfvars"):
        return 8
    if p.endswith(".tf"):
        return 6
    if ".github/workflows" in p and p.endswith(".yml"):
        return 7
    if ".gitlab-ci" in p or p.endswith(".gitlab-ci.yml"):
        return 7
    if "jenkinsfile" in p:
        return 6
    return 0


EXTRACTION_SYSTEM = """
You are an expert at reading infrastructure-as-code repositories and extracting an organisation's
engineering conventions. You are cloud-agnostic — the repos may use AWS, GCP, Azure, or any other provider.

Given source files from one or more IaC repositories, extract conventions and return a single JSON object
with this exact structure:

{
  "org": "organisation slug — infer from resource names, tag values, or repo names",

  "iac_tool": "terraform | opentofu | pulumi | cdk",
  "iac_version": "version string from required_version or tool config",

  "naming": {
    "repo": "repo naming pattern using {service}, {env} tokens if discernible",
    "resources": {
      "<resource_type>": "naming pattern, e.g. {org}-{service}-{env}"
    }
  },

  "environments": ["list", "of", "environment", "names"],

  "required_tags": {
    "TagKey": "static value or empty string if dynamic"
  },

  "modules": {
    "<module_key>": {
      "source": "module source path or URL",
      "version": "pinned version if present",
      "description": "what this module provisions"
    }
  },

  "ci": {
    "provider": "github_actions | gitlab_ci | jenkins | circleci | other",
    "auth_method": "oidc | static_keys | workload_identity | unknown",
    "terraform_version_pinned": true
  },

  "security": {
    "<standard_key>": "description of the standard observed"
  },

  "_sources": {
    "org": "filename where this was found",
    "iac_version": "filename",
    "naming.repo": "filename or 'inferred'",
    "environments": "filename",
    "required_tags": "filename",
    "modules": "filename",
    "ci.provider": "filename",
    "ci.auth_method": "filename"
  },

  "_notes": [
    "Confirmed: what was found and from which file",
    "Gap: what could not be determined and needs manual input"
  ]
}

Rules:
- Only include top-level keys you can actually populate — omit keys you have no evidence for
- naming.resources: use real resource type names you observed (e.g. "gcs_bucket", "iam_role", "security_group")
- environments: infer from .tfvars filenames, workspace names, workflow matrix, or directory names
- required_tags: only include tags you see actually enforced in the code (default_tags blocks, tag arguments)
- modules: only include modules explicitly referenced with a source attribute
- _sources: for every top-level key you populate, name the file it came from
- _notes and _sources are always required
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.
"""


def _fetch_repo_files_for_slug(gh, url: str) -> dict:
    """Return a repo_files entry dict for a single URL. Does not raise."""
    slug = _parse_repo_slug(url)
    if not slug:
        logger.warning("Could not parse repo slug from URL: %s", url)
        return None
    try:
        repo = gh.get_repo(slug)
        logger.info("Fetching files from %s (default branch: %s)", slug, repo.default_branch)
        files = _fetch_repo_files(repo)
        logger.info("Fetched %d files from %s", len(files), slug)
        return {"repo": slug, "files": files}
    except GithubException as e:
        logger.error("GitHub error for %s: %s", slug, e)
        return {"repo": slug, "error": str(e), "files": []}


async def _call_claude(repo_files: list[dict]) -> dict:
    """Send repo files to Claude and return the parsed result dict."""
    prompt = _build_prompt(repo_files)
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=EXTRACTION_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse extraction output: {e}")
    return result


def _build_result(repo_files: list[dict], parsed: dict) -> dict:
    notes = parsed.pop("_notes", [])
    sources = parsed.pop("_sources", {})
    return {
        "inferred_config": parsed,
        "sources": sources,
        "notes": notes,
        "repos_scanned": [r["repo"] for r in repo_files if not r.get("error")],
    }


async def analyze_repos(repo_urls: list[str], github_token: str) -> dict:
    """Fetch key files from repos and use Claude to extract org conventions."""
    gh = Github(github_token)
    repo_files = []

    for url in repo_urls[:MAX_REPOS]:
        entry = _fetch_repo_files_for_slug(gh, url)
        if entry is not None:
            repo_files.append(entry)

    if not any(r.get("files") for r in repo_files):
        errors = [f"{r['repo']}: {r.get('error', 'no files found')}" for r in repo_files]
        raise RuntimeError(f"Could not fetch any files. Details: {'; '.join(errors)}")

    parsed = await _call_claude(repo_files)
    return _build_result(repo_files, parsed)


async def stream_analyze_repos(repo_urls: list[str], github_token: str):
    """Async generator that yields SSE-style progress events then the final result."""
    try:
        yield {"status": "running", "message": "Connecting to GitHub..."}
        gh = Github(github_token)
        repo_files = []

        for url in repo_urls[:MAX_REPOS]:
            slug = _parse_repo_slug(url)
            if not slug:
                continue
            yield {"status": "running", "message": f"Fetching files from {slug}..."}
            entry = _fetch_repo_files_for_slug(gh, url)
            if entry is not None:
                repo_files.append(entry)

        if not any(r.get("files") for r in repo_files):
            errors = [f"{r['repo']}: {r.get('error', 'no files found')}" for r in repo_files]
            raise RuntimeError(f"Could not fetch any files. Details: {'; '.join(errors)}")

        yield {"status": "running", "message": "Analyzing conventions with Claude..."}
        parsed = await _call_claude(repo_files)
        result = _build_result(repo_files, parsed)
        yield {"status": "done", "result": result}
    except Exception as e:
        yield {"status": "error", "message": str(e)}


def _fetch_repo_files(repo) -> list[dict]:
    """Walk the repo git tree, score files by usefulness, fetch the top N."""
    try:
        tree = repo.get_git_tree(repo.default_branch, recursive=True)
    except GithubException as e:
        logger.error("Failed to get git tree: %s", e)
        return []

    candidates = []
    for item in tree.tree:
        if item.type != "blob":
            continue
        score = _file_score(item.path)
        if score > 0:
            candidates.append((score, item.path))

    candidates.sort(key=lambda x: x[0], reverse=True)
    top_paths = [path for _, path in candidates[:MAX_FILES_PER_REPO]]

    fetched = []
    for path in top_paths:
        try:
            item = repo.get_contents(path)
            text = item.decoded_content.decode("utf-8", errors="replace")
            fetched.append({"path": path, "content": text[:MAX_FILE_CHARS]})
        except GithubException as e:
            logger.warning("Could not fetch %s: %s", path, e)

    return fetched


def _build_prompt(repo_files: list[dict]) -> str:
    sections = []
    for repo in repo_files:
        slug = repo["repo"]
        if repo.get("error"):
            sections.append(f"## Repo: {slug}\nError: {repo['error']}")
            continue
        if not repo["files"]:
            sections.append(f"## Repo: {slug}\nNo relevant files found.")
            continue
        file_blocks = "\n\n".join(
            f"### {f['path']}\n```\n{f['content']}\n```"
            for f in repo["files"]
        )
        sections.append(f"## Repo: {slug}\n\n{file_blocks}")

    return (
        "Extract infrastructure conventions from these repository files.\n\n"
        + "\n\n---\n\n".join(sections)
    )


def _parse_repo_slug(url: str) -> str | None:
    """Return 'owner/repo' from a GitHub URL or slug."""
    url = url.strip().rstrip("/")
    if "github.com/" in url:
        parts = url.split("github.com/")[-1].split("/")
        if len(parts) >= 2:
            return f"{parts[0]}/{parts[1]}"
    elif "/" in url and not url.startswith("http"):
        return url
    return None
