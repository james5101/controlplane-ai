"""
Step 3 (was 4): Generator

Uses Claude to generate the complete file tree for the scaffold.
The file list is derived from the intent — no templates needed.
A single Claude call returns all files using a structured separator format.
"""

import re
import anthropic

client = anthropic.AsyncAnthropic()

FILE_SEPARATOR_PATTERN = re.compile(
    r"===FILE:\s*(.+?)===\n(.*?)(?====FILE:|\Z)", re.DOTALL
)

SYSTEM_PROMPT = """
You are an expert infrastructure-as-code generator for an Internal Developer Platform.

You generate complete, production-ready IaC repository scaffolds based on the developer's
request and the organisation's conventions. You are cloud-agnostic — AWS, GCP, Azure, or any
other provider. You follow the org's standards exactly: naming patterns, required tags,
approved module sources, and security policies.

Rules:
- The developer's request is the PRIMARY directive — generate exactly what they asked for
- Use the org's module catalog for the requested service type if one exists; otherwise use
  the best public registry module
- Apply every security standard from the org config
- Use the org's naming conventions for all resource names
- Empty or missing config values become commented TODO placeholders in the output
- Generate complete, valid files — no ellipsis, no placeholder snippets
- Output every file using EXACTLY this format with no other text:

===FILE: <relative/path/to/file>===
<complete file content>
===FILE: <next/file>===
<content>
"""


async def generate_scaffold(hydrated: dict) -> dict[str, str]:
    intent = hydrated["intent"]
    params = hydrated["params"]

    files = _build_file_list(intent)
    prompt = _build_prompt(intent=intent, params=params, files=files)

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text
    stop_reason = message.stop_reason
    file_tree = _parse_files(raw)
    print(f"[generator] stop_reason={stop_reason} parsed_files={list(file_tree.keys())}")
    if stop_reason == "max_tokens":
        print("[generator] WARNING: response was truncated — increase max_tokens")
    return file_tree


def _build_file_list(intent: dict) -> list[str]:
    """Derive the standard file list from intent. No templates needed."""
    environments = intent.get("environments", ["dev", "prod"])
    ci_provider = intent.get("ci_provider", "github_actions")

    files = [
        "main.tf",
        "variables.tf",
        "outputs.tf",
    ]
    for env in environments:
        files.append(f"environments/{env}.tfvars")
    if ci_provider and ci_provider != "none":
        files.append(".github/workflows/deploy.yml")
    files += [".gitignore", "README.md"]
    return files


def _build_prompt(intent: dict, params: dict, files: list[str]) -> str:
    environments = intent.get("environments", ["dev", "prod"])
    files_list = "\n".join(f"- {f}" for f in files)
    env_text = _format_environment_config(params.get("environment_config", {}))
    modules_text = _format_modules(params.get("modules", {}))

    return f"""## Developer Request
{intent.get("original_request") or str(intent)}

## Parsed Intent
- Cloud: {intent.get("cloud", "unknown")}
- Service type: {intent.get("service_type", "unknown")}
- Environments: {", ".join(environments)}
- CI provider: {intent.get("ci_provider", "github_actions")}
- Notes: {intent.get("notes", "none")}

## Files to Generate
{files_list}

## Org Conventions

### Identity
- Org: {params.get("org", "my-org")}
- Service name: {params.get("service_name", "my-service")}
- Repo name: {params.get("repo_name", "my-service-infra")}
- IaC version: {params.get("iac_version", "1.9.0")}

### Naming Conventions
{_format_dict(params.get("naming", {}))}

### Security Standards
{_format_dict(params.get("security", {}))}

### Module Catalog
{modules_text}

### Per-Environment Config
{env_text}

### Required Tags
{_format_dict(params.get("required_tags", {}))}

Generate all {len(files)} files now.
"""


def _format_modules(modules: dict) -> str:
    if not modules:
        return "No private catalog — use best public registry module for the requested service type."
    lines = []
    for key, mod in modules.items():
        lines.append(f"- {key}: source={mod.get('source')} version={mod.get('version')}")
        if mod.get("description"):
            lines.append(f"  {mod['description']}")
    return "\n".join(lines)


def _format_environment_config(env_config: dict) -> str:
    if not env_config:
        return "No environment config — use TODO placeholder comments for any env-specific values."
    lines = []
    for env, cfg in env_config.items():
        lines.append(f"**{env}**")
        if isinstance(cfg, dict):
            for k, v in cfg.items():
                lines.append(f"  {k}: {v if v else '(not set — TODO placeholder)'}")
        else:
            lines.append(f"  {cfg}")
    return "\n".join(lines)


def _format_dict(data: dict) -> str:
    if not data:
        return "(none configured)"
    lines = []
    for k, v in data.items():
        if isinstance(v, dict):
            lines.append(f"  {k}:")
            for sk, sv in v.items():
                lines.append(f"    {sk}: {sv}")
        else:
            lines.append(f"  {k}: {v}")
    return "\n".join(lines)


def _parse_files(raw: str) -> dict[str, str]:
    """Parse the ===FILE: path=== ... format returned by Claude."""
    file_tree = {}
    matches = FILE_SEPARATOR_PATTERN.findall(raw)
    for path, content in matches:
        path = path.strip().replace("\\", "/")
        file_tree[path] = content.rstrip("\n") + "\n"
    return file_tree
