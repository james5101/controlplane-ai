# ControlPlane AI

An **AI-powered Internal Developer Platform (IDP)** that gives developers a natural language interface to self-serve production-ready infrastructure — pre-wired to your org's own conventions from day one.

---

## What it does

A developer describes what they need in plain English:

> *"Terraform repo for a Cloud Run service on GCP, dev and prod environments, GitHub Actions"*

ControlPlane AI creates a GitHub repo, generates a complete IaC scaffold (Terraform + CI/CD + environment config), and opens a PR. The generated code follows **your org's own conventions** — naming patterns, required tags, module sources, security standards — extracted automatically from your existing repos.

---

## Key features

### Repo Bootstrap Agent
Natural language → production-ready GitHub repo in ~60 seconds. Cloud-agnostic: AWS, GCP, Azure, or anything Terraform supports. Live step-by-step progress via SSE streaming.

### Repo Analyzer
Point it at 1–5 of your existing infrastructure repos. It scans them via the GitHub API, uses Claude to extract your conventions (naming patterns, required tags, IaC version, module sources, CI auth method), and saves them as your org's config. Every generated scaffold from that point follows your standards automatically.

### Org Config Editor
Review and manually edit the extracted conventions at any time before they affect generation.

---

## Agent pipeline

No templates — the generator is cloud-agnostic and driven entirely by intent + org conventions.

```
User request (natural language)
        │
        ▼
┌─────────────────────┐
│  1. Intent Parser   │  Extracts: cloud, service type, environments,
│                     │  CI provider, repo name, special requirements
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Config Hydrator │  Loads org conventions from DB — naming,
│                     │  tags, modules, security, env config
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. Generator       │  Claude generates the full file tree:
│                     │  main.tf, variables.tf, outputs.tf,
│                     │  per-env tfvars, CI workflow, README
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. GitHub Pusher   │  Creates repo, commits scaffold on a
│                     │  branch, opens PR for developer review
└─────────────────────┘
```

Each step is discrete — independently debuggable, retryable, and extensible.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (TypeScript, App Router) |
| Backend | FastAPI (Python 3.12) |
| AI | Claude claude-sonnet-4-6 (Anthropic) |
| Auth | GitHub OAuth |
| Database | PostgreSQL via Supabase |
| GitHub automation | PyGithub |

---

## Project structure

```
controlplane-ai/
├── api/
│   ├── agent/
│   │   ├── orchestrator.py      # Chains the 4 pipeline steps
│   │   ├── intent_parser.py     # Step 1: NL → structured intent
│   │   ├── config_hydrator.py   # Step 2: load + apply org config
│   │   ├── generator.py         # Step 3: generate file tree via Claude
│   │   ├── github_pusher.py     # Step 4: create repo + PR
│   │   └── repo_analyzer.py     # Standalone: scan repos → extract conventions
│   ├── routers/
│   │   ├── services.py          # POST /services/bootstrap (+ /stream SSE)
│   │   ├── orgs.py              # GET/PUT /orgs/{id}/config, analyze-repos
│   │   └── auth.py              # GitHub OAuth
│   ├── db/
│   │   ├── connection.py        # asyncpg pool
│   │   └── init.sql             # Schema (org_configs table)
│   ├── main.py
│   └── requirements.txt
├── web/
│   ├── app/
│   │   ├── new/                 # New service — NL input + live bootstrap progress
│   │   ├── orgs/
│   │   │   ├── analyze/         # Repo analyzer — scan → preview → apply
│   │   │   └── config/          # Org config YAML editor
│   │   ├── catalog/             # Service catalog
│   │   └── templates/           # Template browser
│   ├── components/
│   │   ├── sidebar.tsx
│   │   └── step-progress.tsx    # Live step status component
│   └── lib/
│       ├── api.ts               # API client (fetch + SSE stream helpers)
│       └── utils.ts
├── docker-compose.yml
├── .env.example
└── CLAUDE.md                    # Context for Claude Code
```

---

## Getting started

### Prerequisites

- Docker and Docker Compose
- Anthropic API key
- GitHub personal access token (`repo` scope for private repos, `public_repo` for public)
- GitHub username or org name to create repos under

### Running locally

```bash
git clone https://github.com/james5101/controlplane-ai.git
cd controlplane-ai

# Configure environment
cp .env.example .env
# Edit .env — fill in ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_ORG_LOGIN

# Start everything
docker compose up
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

### First run

1. Go to **Analyze Repos** in the sidebar
2. Paste URLs of 1–5 existing Terraform repos
3. Review the extracted conventions and click **Apply as Org Config**
4. Go to **New Service**, describe what you want, click **Bootstrap**

If you skip the analyzer, the agent will still generate — it just uses sensible defaults instead of your org's standards.

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GITHUB_TOKEN` | GitHub PAT for repo creation and file fetching |
| `GITHUB_ORG_LOGIN` | GitHub username or org to create repos under |
| `DATABASE_URL` | PostgreSQL connection string |

---

## Business model

Open source core + hosted SaaS. The hosted version removes self-hosting friction for startups. Enterprise tier adds SSO, audit logs, and RBAC.

---

## Roadmap

| Phase | Capability |
|---|---|
| MVP ✓ | Bootstrap agent — cloud-agnostic Terraform + CI/CD |
| MVP ✓ | Repo Analyzer — extract conventions from existing repos |
| MVP ✓ | Live SSE streaming — real-time step progress |
| Next | Auth flow — GitHub OAuth end-to-end |
| Next | Service catalog — track what's been bootstrapped |
| Next | Per-org GitHub token storage (secrets manager) |
| Future | Drift detection — flag repos that diverge from org standards |
| Future | Private module registry support |
