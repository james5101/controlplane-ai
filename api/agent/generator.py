"""
Step 4: Generator

Consumes the file manifest produced by the Scaffold Planner and generates
the content of every file. Files are generated in dependency-ordered batches
(one Claude call per logical group) so each call is focused and never truncated.

Each batch receives:
  - The full manifest as a reference map (what every file is for)
  - Already-generated files for cross-referencing (variable names, module sources, outputs)
  - The specific files to generate in this call
  - Org conventions and security standards

This approach scales to any stack (Terraform, CDK, Pulumi, React, anything)
because structure decisions live in the Scaffold Planner prompt, not here.
"""

import json
import re
import anthropic

client = anthropic.AsyncAnthropic()

FILE_SEPARATOR_PATTERN = re.compile(
    r"===FILE:\s*(.+?)===\n(.*?)(?====FILE:|\Z)", re.DOTALL
)

# Group ordering — determines which groups are generated first.
# Groups not matching any prefix are generated after modules, before ci.
GROUP_ORDER = [
    "root",
    "modules/",
    "environments/",
    "components/",
    "lib/",
    "src/",
    "ci",
    "docs",
]

SYSTEM_PROMPT = """
You are a principal engineer generating production-ready code for a new repository scaffold.

You will be given:
  1. A full file manifest — every file in the repo and what it does
  2. Already-generated files — reference these for variable names, module outputs, and paths
  3. The specific files to generate right now
  4. Org conventions, naming standards, security requirements, and available modules

Your only job is to write the CONTENT of the specified files. Structure has already been decided.

════════════════════════════════════════════════════════
CODE QUALITY RULES
════════════════════════════════════════════════════════

COMPLETENESS
- Generate complete, valid, deployable code in every file
- No ellipsis ("..."), no stubs, no "add your logic here" comments
- The only acceptable TODOs are for values that genuinely require customer input:
  account IDs, domain names, ARNs of pre-existing resources
  Format: # TODO: replace with your {description}

CROSS-REFERENCING
- If main.tf calls a module, use the exact source path shown in the manifest
- Variable names must be consistent across files that reference each other
- Module outputs referenced in environments/ must match names defined in modules/outputs.tf
- CI workflow steps must reference the correct environment directory paths

TERRAFORM-SPECIFIC
- All variables: type + description required; default only if genuinely optional
- All outputs: description + value required
- All resources: apply every required tag from org conventions
- Provider version constraints in versions.tf only — never in main.tf or modules
- Backend config in environments/{env}/backend.tf — unique key per environment:
    key = "{org}/{repo}/{env}/terraform.tfstate"
- Remote state only — S3 for AWS, GCS for GCP, AzureRM for Azure
- Use data sources to reference existing resources rather than hardcoding ARNs
- Sensitive variables marked sensitive = true

TERRAFORM SECURITY (enforce even if not in org config)
- S3: server_side_encryption_configuration with aws:kms or AES256
- S3: block_public_access block always present (all four booleans = true unless explicitly public)
- RDS: storage_encrypted = true, deletion_protection = true in prod, backup_retention_period >= 7
- RDS: multi_az = true in prod environments
- EC2: ebs_optimized = true where supported; EBS volumes encrypted
- KMS: if CMK requested, define aws_kms_key with enable_key_rotation = true
- IAM: specific actions only — no "Action: *" or "Resource: *" wildcards
- Security groups: no 0.0.0.0/0 ingress except load balancer on 80/443
- NLB/ALB: access_logs enabled, deletion_protection = true in prod

CI/CD SECURITY
- AWS: use aws-actions/configure-aws-credentials@v4 with role-to-assume (OIDC)
- GCP: use google-github-actions/auth with workload_identity_provider (OIDC)
- Azure: use azure/login with federated-client-id (OIDC)
- NEVER use AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or equivalent static credentials
- Pin action versions to specific SHAs or major versions (e.g. @v4 not @main)
- Run terraform fmt -check and terraform validate before plan
- Post plan output to PR as a comment using actions/github-script

NAMING
- Apply org naming conventions to every resource name and identifier
- Apply every required tag to every taggable AWS/GCP/Azure resource
- Use variables for all environment-specific values — no hardcoding

════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════

Return ONLY file content blocks. No preamble, no explanation, no markdown outside blocks.

===FILE: relative/path/to/file.ext===
<complete file content>
===FILE: next/file.ext===
<complete file content>
"""


def _order_groups(manifest: list[dict]) -> list[str]:
    """Return group names sorted by dependency order."""
    groups: dict[str, set] = {}
    for entry in manifest:
        g = entry["group"]
        deps = set(entry.get("dependencies", []))
        if g not in groups:
            groups[g] = deps
        else:
            groups[g].update(deps)

    # Topological sort
    ordered: list[str] = []
    remaining = dict(groups)

    while remaining:
        # Find groups whose dependencies are all already ordered
        ready = [
            g for g, deps in remaining.items()
            if all(d in ordered or d not in remaining for d in deps)
        ]
        if not ready:
            # Cycle or unresolvable — fall back to prefix ordering
            ready = list(remaining.keys())

        # Within the ready set, sort by GROUP_ORDER prefixes
        def _priority(g: str) -> int:
            for i, prefix in enumerate(GROUP_ORDER):
                if g == prefix or g.startswith(prefix):
                    return i
            return len(GROUP_ORDER)

        ready.sort(key=_priority)
        pick = ready[0]
        ordered.append(pick)
        del remaining[pick]

    return ordered


def _build_manifest_summary(manifest: list[dict]) -> str:
    return "\n".join(f"  {e['path']} — {e['purpose']}" for e in manifest)


def _build_reference_context(generated: dict[str, str], max_files: int = 8) -> str:
    """Show already-generated files so the generator can cross-reference them."""
    if not generated:
        return "(none — this is the first batch)"
    lines = []
    for path, content in list(generated.items())[:max_files]:
        # Show full content for small files, truncated for large ones
        preview = content if len(content) < 1200 else content[:1200] + "\n# ... (truncated for brevity)"
        lines.append(f"===REFERENCE: {path}===\n{preview}")
    if len(generated) > max_files:
        remaining = list(generated.keys())[max_files:]
        lines.append(f"# (plus {len(remaining)} more already generated: {', '.join(remaining)})")
    return "\n\n".join(lines)


def _build_batch_prompt(
    manifest: list[dict],
    generated: dict[str, str],
    files_to_generate: list[str],
    intent: dict,
    params: dict,
    org_config: dict,
) -> str:
    environments = intent.get("environments", ["dev", "prod"])

    return f"""## Full repository manifest
{_build_manifest_summary(manifest)}

## Already-generated files (reference for variable names, module sources, outputs)
{_build_reference_context(generated)}

## Files to generate NOW
{chr(10).join(f"  {p}" for p in files_to_generate)}

════════════════════════════════════════════════════════
ORG CONVENTIONS
════════════════════════════════════════════════════════

Identity
  Org:          {org_config.get('org', 'my-org')}
  Service name: {params.get('service_name', 'my-service')}
  Repo name:    {params.get('repo_name', 'my-service-infra')}
  IaC version:  {params.get('iac_version', '1.9.0')}
  Cloud:        {intent.get('cloud', 'aws')}
  Stack:        {intent.get('stack', 'terraform')}
  Environments: {', '.join(environments)} (in this deployment order)

Naming conventions
{json.dumps(params.get('naming', {}), indent=2) or '  (none configured — use {org}-{service}-{env}-{resource} pattern)'}

Security standards
{json.dumps(params.get('security', {}), indent=2) or '  (none configured — apply defaults from system rules above)'}

Module catalog (use these sources when available, otherwise best public registry module)
{json.dumps(params.get('modules', {}), indent=2) or '  (none configured)'}

Required tags (apply to every taggable resource)
{json.dumps(params.get('required_tags', {}), indent=2) or '  ManagedBy: controlplane-ai'}

Per-environment configuration
{json.dumps(params.get('environment_config', {}), indent=2) or '  (none configured — use sensible defaults per environment)'}

Resources requested: {', '.join(intent.get('resources', []))}
Special notes: {intent.get('notes', 'none')}

Generate the files listed above now. Be complete — no stubs, no ellipsis.
"""


async def generate_scaffold(hydrated: dict, manifest: list[dict]) -> dict[str, str]:
    """
    Generate file content for every file in the manifest.

    Files are generated in dependency-ordered batches (one call per group).
    Each batch receives already-generated files as reference context.
    """
    intent = hydrated["intent"]
    params = hydrated["params"]
    org_config = hydrated["org_config"]

    # Group files by their group field
    groups: dict[str, list[str]] = {}
    path_to_entry: dict[str, dict] = {e["path"]: e for e in manifest}
    for entry in manifest:
        groups.setdefault(entry["group"], []).append(entry["path"])

    ordered_groups = _order_groups(manifest)
    file_tree: dict[str, str] = {}

    for group in ordered_groups:
        files_in_group = groups.get(group, [])
        if not files_in_group:
            continue

        prompt = _build_batch_prompt(
            manifest=manifest,
            generated=file_tree,
            files_to_generate=files_in_group,
            intent=intent,
            params=params,
            org_config=org_config,
        )

        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=12000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text
        stop_reason = message.stop_reason
        batch_files = _parse_files(raw)

        if stop_reason == "max_tokens":
            print(f"[generator] WARNING: group '{group}' was truncated — consider splitting")

        print(f"[generator] group='{group}' generated={list(batch_files.keys())}")
        file_tree.update(batch_files)

    return file_tree


def _parse_files(raw: str) -> dict[str, str]:
    file_tree = {}
    matches = FILE_SEPARATOR_PATTERN.findall(raw)
    for path, content in matches:
        path = path.strip().replace("\\", "/")
        file_tree[path] = content.rstrip("\n") + "\n"
    return file_tree
