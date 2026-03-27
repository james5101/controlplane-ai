# ControlPlane AI — Claude Code Context

## Project Overview
ControlPlane AI is an AI-powered Internal Developer Platform (IDP) that automates platform engineering workflows. The core MVP scaffolds a full cloud environment (Terraform + GitHub Actions CI/CD + boilerplate) from a single developer request, creating a GitHub repo and opening a PR automatically.

**Business model:** Open source core + hosted SaaS. Likely seat-based or workspace-based pricing. Target customers are startups initially, with architecture designed to scale to larger orgs.

## Stack
- **Backend:** FastAPI (Python 3.12) — `api/`
- **Frontend:** Next.js 15 (TypeScript) — `web/`
- **AI:** Claude claude-sonnet-4-6 (Anthropic)
- **Auth:** GitHub OAuth + JWT (httpOnly cookie)
- **Database:** PostgreSQL via asyncpg (direct connection, not Supabase client)
- **Infra:** Docker Compose for local dev (`docker-compose.yml`)

## Agent Architecture
The agent pipeline is the core of the product. Each step is a discrete module in `api/agent/`:

```
Intent Parser → Config Hydrator → Scaffold Planner → Generator → Runbook Generator → GitHub Pusher
```

- `intent_parser.py` — NL → structured intent: stack, cloud, service_type, resources[], environments, CI, has_promotion_pipeline, repo_name_hint, notes. Orchestrator adds `original_request` to the dict after parsing.
- `config_hydrator.py` — Loads org conventions from the database (naming, security, modules, tags). Signature: `hydrate_config(org_id, intent)` — no template arg.
- `scaffold_planner.py` — Intent + org config → annotated file manifest (path, purpose, group, dependencies). Owns all structural/architectural decisions. Stack-agnostic via Claude prompt — works for Terraform, CDK, Pulumi, React, Next.js, or any framework without code changes.
- `generator.py` — Consumes the manifest and generates file content in dependency-ordered batches (one Claude call per logical group). Each batch receives the full manifest + already-generated files as reference context. Semaphore caps concurrent calls to prevent 429s.
- `runbook_generator.py` — Synthesises RUNBOOK.md from the generated file tree + intent
- `github_pusher.py` — Creates the repo and opens a PR. Takes explicit `github_token` and `github_org_login` params. Uses Contents API per file with retry (tree API unreliable on fresh repos). Handles name conflicts with hex suffix.
- `orchestrator.py` — Coordinates all steps. Has two modes: `run_bootstrap_agent` (sync) and `stream_bootstrap_agent` (async generator for SSE streaming).
- `repo_analyzer.py` — Standalone: scans existing repos to extract org conventions

**No templates. No hardcoded structure.** The Scaffold Planner uses Claude to produce the canonical file structure for any stack. The Generator fills in content. New stacks (CDK, Pulumi, React, etc.) require only prompt knowledge, not code changes.

**Design rule:** New features must be implemented as discrete agent steps. Never skip or merge steps — this is intentional for debuggability, retries, and future human-in-the-loop checkpoints.

**Generator batching:** Files are grouped by logical unit (e.g. `modules/compute`, `environments/dev`, `ci`) and generated one group at a time. This avoids max_tokens truncation and lets each call cross-reference already-generated files accurately.

## Auth & Workspace
- GitHub OAuth flow in `api/routers/auth.py`; JWT stored in httpOnly cookie
- `api/auth_utils.py` — `require_workspace` FastAPI dependency; extracts `org_id` from `active_workspace` JWT claim
- All org-scoped routes use `Depends(require_workspace)` — never hardcode org_id
- Required env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `JWT_SECRET`, `FRONTEND_URL`

## Database Schema
Three tables in `api/db/init.sql`:
- `users` — GitHub OAuth user records (github_id, github_login, github_token, avatar_url)
- `org_configs` — JSONB org conventions, keyed by org_id (workspace)
- `bootstrapped_services` — catalog of every service the agent has created, per org (includes runbook_md, runbook_generated_at)

**Schema changes in dev:** `docker compose down -v && docker compose up --build` to recreate the volume and re-run `init.sql`.

## Org Configuration
Org conventions are stored in the database (`org_configs` table) and loaded by the config hydrator at generation time. Populated either manually via the Org Config editor (`/orgs/config`) or automatically via the Repo Analyzer (`/orgs/analyze`). Cloud-agnostic — works for AWS, GCP, Azure.

**Known issue:** The org setup wizard can produce malformed `required_tags` entries — nested dicts with null values instead of strings. If generation produces bad tags, inspect and fix via the Org Config YAML editor.

## Service Catalog
Every successful bootstrap (both sync and streaming paths) writes a record to `bootstrapped_services`. `GET /services/` returns the catalog for the active workspace. The catalog page (`web/app/catalog/`) fetches on load and renders cloud/type/env badges with direct links to the repo and PR. Per-service view shows RUNBOOK.md and staleness indicators.

## Project Structure
```
controlplane-ai/
├── api/
│   ├── agent/              # Multi-step agent pipeline
│   │   ├── orchestrator.py
│   │   ├── intent_parser.py
│   │   ├── config_hydrator.py
│   │   ├── scaffold_planner.py
│   │   ├── generator.py
│   │   ├── runbook_generator.py
│   │   ├── github_pusher.py
│   │   └── repo_analyzer.py
│   ├── db/                 # DB connection (asyncpg) and schema (init.sql)
│   ├── routers/            # FastAPI route handlers (auth, orgs, services)
│   ├── auth_utils.py       # require_workspace dependency
│   └── main.py
├── web/
│   ├── app/                # Next.js app router pages
│   │   ├── catalog/        # Service catalog (live — fetches from DB)
│   │   ├── login/          # GitHub OAuth login page
│   │   ├── new/            # Create new service flow (SSE progress)
│   │   └── orgs/
│   │       ├── analyze/    # Repo analyzer — scan → preview → apply
│   │       └── config/     # Org config YAML editor
│   ├── components/         # Shared UI components (sidebar, step-progress, ui/)
│   └── lib/                # API client (api.ts) and utils
├── templates/              # Vestigial — scaffold_planner replaced template-based generation
└── docker-compose.yml
```

## Developer Notes
- Always design new agent capabilities as new discrete steps in the pipeline
- Org conventions live in the DB (`org_configs`), not in config files — don't hardcode them
- The multi-step agent pattern should be the model for all future platform features
- New DB tables must be added to `init.sql` and require a volume recreate in dev
- `templates/` directory is vestigial — do not add new templates or template-based logic
