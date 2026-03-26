"""
Step 5: Runbook Generator

Synthesises a living operational runbook from the generated file tree and
hydrated context. The runbook is committed to the scaffold branch alongside
the IaC, so developers see it in the same PR they review.

Called before the GitHub Pusher — injects RUNBOOK.md into the file_tree so
it gets committed in a single batch with the rest of the scaffold.
"""

import anthropic

client = anthropic.AsyncAnthropic()

_RELEVANT_FILES = [
    "main.tf",
    "variables.tf",
    "outputs.tf",
    ".github/workflows/deploy.yml",
    ".github/workflows/ci.yml",
    "cloudbuild.yaml",
    ".gitlab-ci.yml",
]


def _extract_context_files(file_tree: dict[str, str]) -> str:
    """Pull the most runbook-relevant files from the tree for the prompt."""
    sections = []
    for path, content in file_tree.items():
        if any(path.endswith(f.split("/")[-1]) or path == f for f in _RELEVANT_FILES):
            sections.append(f"### {path}\n```\n{content}\n```")
    if not sections:
        # Fall back to first 3 files if nothing matched
        for path, content in list(file_tree.items())[:3]:
            sections.append(f"### {path}\n```\n{content}\n```")
    return "\n\n".join(sections)


SYSTEM_PROMPT = """\
You are a senior platform engineer writing an operational runbook for a new service.
You will be given the service's intent, org configuration, and generated infrastructure
files. Write a clear, practical runbook that a developer or on-call engineer can follow.

Rules:
- Be specific, not generic. Reference actual file names, environment names, and tool names from the context.
- Do not invent values not present in the context. Use placeholders like {REPO_URL} only when the value is genuinely unknown.
- Use markdown with headers (##), tables, and code blocks.
- Keep each section concise — this is a reference doc, not a tutorial.
- Return only the markdown content. No preamble, no explanation.
"""


async def generate_runbook(hydrated: dict, file_tree: dict[str, str]) -> str:
    intent = hydrated["intent"]
    params = hydrated["params"]
    org_config = hydrated["org_config"]

    context_files = _extract_context_files(file_tree)

    environments = params.get("environments", ["dev", "prod"])
    env_rows = "\n".join(f"| {e} | | |" for e in environments)

    prompt = f"""\
## Service intent
- Original request: "{intent.get('original_request', '')}"
- Cloud: {intent.get('cloud', 'unknown')}
- Service type: {intent.get('service_type', 'unknown')}
- Environments: {', '.join(environments)}
- CI provider: {intent.get('ci_provider', 'github_actions')}
- Repo name: {params.get('repo_name', 'unknown')}

## Org conventions
- Org: {org_config.get('org', 'unknown')}
- IaC tool: {org_config.get('iac_tool', 'terraform')} {params.get('iac_version', '')}
- Required tags: {org_config.get('required_tags', {})}

## Generated infrastructure files
{context_files}

---

Write a runbook with these exact sections:

# Runbook — {params.get('repo_name', 'service')}

## What this service does
(2–3 sentences derived from the original request)

## Architecture
(bullet list: cloud, service type, IaC tool + version, CI/CD provider)

## Environments
| Environment | Purpose | Notes |
|---|---|---|
{env_rows}

## How to deploy
(numbered steps — reference the actual CI workflow file if present)

## How to rollback
(numbered steps for the specific service type and cloud)

## How to scale
(specific to the service type — e.g. ECS desired count, Cloud Run min/max instances)

## Health checks
(how to verify the service is up — specific to cloud + service type)

## Required secrets & config
(table: Variable | Purpose — derived from variables.tf. Never include values.)

## Common failure modes
(3–5 bullet points specific to this service type and cloud, with resolution steps)

## Monitoring & logs
(where to find logs and metrics for this cloud + service type)

## Ownership
| Field | Value |
|---|---|
| Org | {org_config.get('org', 'unknown')} |
| Service | {params.get('repo_name', 'unknown')} |
| Bootstrapped by | ControlPlane AI |
"""

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text.strip()
