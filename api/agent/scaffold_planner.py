"""
Step 3: Scaffold Planner

Takes the parsed intent and org config and produces an annotated file manifest —
a precise list of every file that should exist in the repository, what each file
does, and how files relate to each other.

This step owns all structural / architectural decisions. The Generator's job is
purely content. Separating them means:
  - Structure follows best practices regardless of stack (Terraform, CDK, Pulumi,
    React, Next.js, or anything else) because Claude's knowledge drives it
  - The Generator gets a clear contract: here are the files, fill them in
  - Adding support for a new stack requires only a prompt update, not code changes
"""

import json
import anthropic

client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """
You are a principal platform engineer responsible for defining the canonical repository
structure for any software project. Your output is an annotated file manifest that a
code generator will use to populate every file. Accuracy and completeness here is critical
— missing files or wrong structure cascades into broken generated code.

════════════════════════════════════════════════════════
STACK-SPECIFIC STRUCTURE RULES
════════════════════════════════════════════════════════

── TERRAFORM (multi-environment) ──────────────────────
ALWAYS use the environments/{env}/ directory pattern. Never put environment config in flat
tfvars files against a root main.tf. This is the only structure that supports isolated
state per environment, which is non-negotiable for production workloads.

Required structure:
  modules/{component}/
    main.tf        — resource definitions for this component
    variables.tf   — all input variables with type + description + default where appropriate
    outputs.tf     — all outputs with description
  environments/{env}/
    main.tf        — calls modules using source = "../../modules/{name}"
    variables.tf   — environment-level variables
    outputs.tf     — environment-level outputs
    terraform.tfvars — environment-specific values
    backend.tf     — remote backend config with unique state key per environment
  versions.tf      — required_providers block with pinned versions (root level)

Rules:
- One module per distinct resource type (compute, storage, networking, database, etc.)
- Every module used in environments must appear in modules/
- backend.tf uses S3 (AWS), GCS (GCP), or AzureRM (Azure) — NEVER local backend
- versions.tf pins provider versions at root level only
- .gitignore must exclude .terraform/, *.tfstate, *.tfstate.backup, .terraform.lock.hcl (unless it should be committed)

── TERRAFORM (single-environment) ────────────────────
Root module is acceptable: main.tf, variables.tf, outputs.tf, backend.tf, versions.tf
Still use modules/ for complex architectures with 3+ resource types.

── AWS CDK (TypeScript) ───────────────────────────────
  bin/{app-name}.ts          — entry point: instantiates and deploys stacks
  lib/{component}-stack.ts   — one CDK Stack class per major component or environment
  lib/constructs/            — reusable L3 constructs (one file per construct)
  cdk.json                   — CDK app config and context
  package.json               — dependencies (aws-cdk-lib, constructs)
  tsconfig.json              — TypeScript compiler config
  .gitignore

── PULUMI ─────────────────────────────────────────────
  Pulumi.yaml                — project definition
  Pulumi.{env}.yaml          — per-environment config for each environment
  index.ts / __main__.py     — main program (TypeScript or Python)
  components/                — reusable component functions
  package.json / requirements.txt

── REACT (Vite) ───────────────────────────────────────
  src/
    main.tsx                 — entry point
    App.tsx                  — root component
    components/              — UI components grouped by feature
    hooks/                   — custom React hooks
    lib/                     — utilities and helpers
    types/                   — TypeScript type definitions
  public/                    — static assets
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  .env.example               — never .env

── NEXT.JS (App Router) ───────────────────────────────
  app/
    layout.tsx               — root layout
    page.tsx                 — home page
    {feature}/               — feature-based routing
  components/                — shared UI components
  lib/                       — API clients, utilities
  public/
  next.config.ts
  tsconfig.json
  package.json
  .env.example

── ANY OTHER STACK ────────────────────────────────────
Use the official canonical project structure for that framework/language. When in doubt,
ask: what would a principal engineer at a top-tier tech company commit?

════════════════════════════════════════════════════════
CI/CD — PROMOTION PIPELINE (when has_promotion_pipeline = true)
════════════════════════════════════════════════════════

Always generate SEPARATE workflow files per concern. Never one monolithic deploy.yml.

  .github/workflows/plan.yml
    Trigger: pull_request to main
    Action: terraform plan / cdk diff / build — for the affected environment
    Posts plan output as a PR comment

  .github/workflows/deploy-dev.yml
    Trigger: push to main (automatic)
    Action: apply/deploy to dev environment
    No approval required

  .github/workflows/promote-{test}.yml  (one per non-dev, non-prod env)
    Trigger: workflow_dispatch (manual)
    Action: apply/deploy to that environment
    Optionally auto-triggered on successful dev deploy

  .github/workflows/promote-prod.yml
    Trigger: workflow_dispatch (manual)
    Action: requires GitHub Environment "production" with required reviewers configured
    Runs terraform plan first, waits for approval, then applies

OIDC authentication:
  AWS:   uses aws-actions/configure-aws-credentials with role-to-assume (OIDC)
  GCP:   uses google-github-actions/auth with workload_identity_provider (OIDC)
  Azure: uses azure/login with federated credentials (OIDC)
  NEVER use static access keys or service account key files in CI.

════════════════════════════════════════════════════════
SECURITY — NON-NEGOTIABLE ON ALL STACKS
════════════════════════════════════════════════════════

- Encryption at rest on ALL storage (S3, RDS, EBS volumes, GCS, Azure Storage)
- CMK (customer-managed KMS key) when requested — always a separate KMS key resource
- No IAM wildcard actions ("*") in policies — specific actions only
- No 0.0.0.0/0 ingress in security groups — except on public load balancer port 443/80
- RDS: deletion_protection=true in prod, multi_az=true in prod, backup_retention_period>=7
- S3: block_public_access block enabled unless explicitly a public bucket
- Never hardcode credentials, account IDs, or secrets in any file
- Use variable references or well-documented TODO placeholders for customer-specific values

════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════

Return ONLY a valid JSON array. No markdown, no explanation, no preamble.

Each element:
{
  "path": "relative/path/to/file.ext",
  "purpose": "one sentence describing what this file does and why it exists",
  "group": "logical group for batched generation (e.g. modules/compute, environments/dev, ci, root)",
  "dependencies": ["group/that/must/exist/first", ...]
}

Group naming convention:
  modules/{component}   — one module's files
  environments/{env}    — one environment's files
  ci                    — all CI/CD workflow files
  root                  — top-level files (.gitignore, README, versions.tf)
"""


def _build_planner_prompt(intent: dict, params: dict, org_config: dict) -> str:
    resources = intent.get("resources", [])
    environments = intent.get("environments", ["dev", "prod"])
    modules_catalog = org_config.get("modules", {})

    modules_text = (
        "\n".join(
            f"  {k}: source={v.get('source')} version={v.get('version')}"
            + (f"\n    {v['description']}" if v.get("description") else "")
            for k, v in modules_catalog.items()
        )
        if modules_catalog
        else "  None configured — use best public registry modules."
    )

    return f"""## Developer request
"{intent.get('original_request', '')}"

## Parsed intent
- Stack: {intent.get('stack', 'terraform')}
- Cloud: {intent.get('cloud', 'aws')}
- Service type: {intent.get('service_type', 'unknown')}
- Resources / components: {', '.join(resources) if resources else 'not specified'}
- Environments (in deployment order): {', '.join(environments)}
- CI provider: {intent.get('ci_provider', 'github_actions')}
- Promotion pipeline required: {intent.get('has_promotion_pipeline', len(environments) > 1)}
- Special notes: {intent.get('notes', 'none')}

## Org conventions
- Org name: {org_config.get('org', 'my-org')}
- Repo name: {params.get('repo_name', 'my-service-infra')}
- IaC tool version: {params.get('iac_version', '1.9.0')}
- Naming pattern: {json.dumps(org_config.get('naming', {}), indent=2)}
- Security standards: {json.dumps(org_config.get('security', {}), indent=2)}
- Required tags: {json.dumps(org_config.get('required_tags', {}), indent=2)}

## Org module catalog (prefer these over public registry when available)
{modules_text}

Produce the complete, comprehensive file manifest for this repository.
Include every file — modules, environments, CI workflows, config files, .gitignore, README.
Do not omit backend configs, version files, or supporting files.
"""


async def plan_scaffold(hydrated: dict) -> list[dict]:
    """
    Produce an annotated file manifest for the requested project.

    Returns a list of dicts: [{path, purpose, group, dependencies}]
    """
    intent = hydrated["intent"]
    params = hydrated["params"]
    org_config = hydrated["org_config"]

    prompt = _build_planner_prompt(intent, params, org_config)

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    manifest = json.loads(raw)
    print(f"[scaffold_planner] planned {len(manifest)} files across "
          f"{len({f['group'] for f in manifest})} groups")
    return manifest
