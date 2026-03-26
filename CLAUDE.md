# ControlPlane AI — Claude Code Context

## Project Overview
ControlPlane AI is an AI-powered Internal Developer Platform (IDP) that automates platform engineering workflows. The core MVP scaffolds a full cloud environment (Terraform + GitHub Actions CI/CD + boilerplate) from a single developer request, creating a GitHub repo and opening a PR automatically.

**Business model:** Open source core + hosted SaaS. Likely seat-based or workspace-based pricing. Target customers are startups initially, with architecture designed to scale to larger orgs.

## Stack
- **Backend:** FastAPI (Python) — `api/`
- **Frontend:** Next.js (TypeScript) — `web/`
- **AI:** Claude API, multi-step agent pipeline
- **Auth:** GitHub OAuth
- **Database:** PostgreSQL via Supabase
- **Infra:** Docker Compose for local dev (`docker-compose.yml`)

## Agent Architecture
The agent pipeline is the core of the product. Each step is a discrete module in `api/agent/`:

```
Intent Parser → Config Hydrator → Scaffold Planner → Generator → Runbook Generator → GitHub Pusher
```

- `intent_parser.py` — NL → structured intent: stack, cloud, resources[], environments, CI, has_promotion_pipeline
- `config_hydrator.py` — Loads org conventions from the database (naming, security, modules, tags)
- `scaffold_planner.py` — Intent + org config → annotated file manifest (path, purpose, group, dependencies). Owns all structural/architectural decisions. Stack-agnostic via Claude prompt — works for Terraform, CDK, Pulumi, React, Next.js, or any framework without code changes.
- `generator.py` — Consumes the manifest and generates file content in dependency-ordered batches (one Claude call per logical group). Each batch receives the full manifest + already-generated files as reference context.
- `runbook_generator.py` — Synthesises RUNBOOK.md from the generated file tree + intent
- `github_pusher.py` — Creates the repo and opens a PR (all files in one commit)
- `orchestrator.py` — Coordinates all steps
- `repo_analyzer.py` — Standalone: scans existing repos to extract org conventions

**No templates. No hardcoded structure.** The Scaffold Planner uses Claude to produce the canonical file structure for any stack. The Generator fills in content. New stacks (CDK, Pulumi, React, etc.) require only prompt knowledge, not code changes.

**Design rule:** New features must be implemented as discrete agent steps. Never skip or merge steps — this is intentional for debuggability, retries, and future human-in-the-loop checkpoints.

**Generator batching:** Files are grouped by logical unit (e.g. `modules/compute`, `environments/dev`, `ci`) and generated one group at a time. This avoids max_tokens truncation and lets each call cross-reference already-generated files accurately.

## Database Schema
Three tables in `api/db/init.sql`:
- `users` — GitHub OAuth user records
- `org_configs` — JSONB org conventions, keyed by org_id (workspace)
- `bootstrapped_services` — catalog of every service the agent has created, per org

**Schema changes in dev:** `docker compose down -v && docker compose up --build` to recreate the volume and re-run `init.sql`.

## Org Configuration
Org conventions are stored in the database (`org_configs` table) and loaded by the config hydrator at generation time. Populated either manually via the Org Config editor or automatically via the Repo Analyzer. Cloud-agnostic — works for AWS, GCP, Azure.

## Service Catalog
Every successful bootstrap (both sync and streaming paths) writes a record to `bootstrapped_services`. `GET /services/` returns the catalog for the active workspace. The catalog page (`web/app/catalog/`) fetches on load and renders cloud/type/env badges with direct links to the repo and PR.

## Project Structure
```
controlplane-ai/
├── api/
│   ├── agent/          # Multi-step agent pipeline
│   ├── db/             # DB connection and schema (init.sql)
│   ├── routers/        # FastAPI route handlers (auth, orgs, services)
│   └── main.py
├── web/
│   ├── app/            # Next.js app router pages
│   │   ├── catalog/    # Service catalog (live — fetches from DB)
│   │   ├── login/      # GitHub OAuth login page
│   │   ├── new/        # Create new service flow
│   │   └── orgs/       # Org management (analyze + config editor)
│   ├── components/     # Shared UI components
│   └── lib/            # API client (api.ts) and utils
└── docker-compose.yml
```

## Developer Notes
- Always design new agent capabilities as new discrete steps in the pipeline
- Org conventions live in the DB (`org_configs`), not in config files — don't hardcode them
- The multi-step agent pattern should be the model for all future platform features
- New DB tables must be added to `init.sql` and require a volume recreate in dev
