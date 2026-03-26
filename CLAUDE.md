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
Intent Parser → Config Hydrator → Generator → GitHub Pusher
```

- `intent_parser.py` — Interprets the developer's request into structured intent
- `config_hydrator.py` — Loads org conventions from the database
- `generator.py` — Derives the file list from intent, generates the full file tree via Claude
- `github_pusher.py` — Creates the repo and opens a PR
- `orchestrator.py` — Coordinates all steps
- `repo_analyzer.py` — Standalone: scans existing repos to extract org conventions

**No templates.** The generator is cloud-agnostic and derives what files to create from the intent (environments, CI provider) and what to put in them from the org config. The org's own conventions are the guardrails.

**Design rule:** New features must be implemented as discrete agent steps. Never skip or merge steps — this is intentional for debuggability, retries, and future human-in-the-loop checkpoints.

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
