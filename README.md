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
│  1. Intent Parser   │  Extracts: stack (Terraform/CDK/React/etc.),
│                     │  cloud, resources[], environments, CI, promotion
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Config Hydrator │  Loads org conventions from DB — naming,
│                     │  tags, modules, security standards
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. Scaffold Planner│  Claude designs the repository structure:
│                     │  annotated file manifest with groups and
│                     │  dependencies — works for any stack
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. Generator       │  Fills in file content, one group at a time
│                     │  in dependency order — each batch sees all
│                     │  already-generated files for cross-referencing
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  5. Runbook Generator│ Synthesises RUNBOOK.md from the generated
│                     │  file tree — operational docs committed with
│                     │  the scaffold in the same PR
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  6. GitHub Pusher   │  Creates repo, commits all files on a branch,
│                     │  opens PR for developer review
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
│   │   └── init.sql             # Schema (users, org_configs, bootstrapped_services)
│   ├── main.py
│   └── requirements.txt
├── web/
│   ├── app/
│   │   ├── new/                 # New service — NL input + live bootstrap progress
│   │   ├── orgs/
│   │   │   ├── analyze/         # Repo analyzer — scan → preview → apply
│   │   │   └── config/          # Org config YAML editor
│   │   ├── catalog/             # Service catalog — all bootstrapped services per workspace
│   │   └── login/               # GitHub OAuth login page
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
- GitHub OAuth App (for authentication)

### 1. Create a GitHub OAuth App

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** and fill in:

| Field | Value |
|---|---|
| Application name | ControlPlane AI (or anything you like) |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:8000/auth/github/callback` |

Click **Register application**, then copy the **Client ID** and generate a **Client Secret**.

### 2. Configure environment

```bash
git clone https://github.com/james5101/controlplane-ai.git
cd controlplane-ai
cp .env.example .env
```

Edit `.env` and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_CLIENT_ID=your-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-oauth-app-client-secret
JWT_SECRET=any-long-random-string
```

The remaining variables have sensible defaults for local development and don't need to be changed.

### 3. Start the app

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

> **First run:** Docker will initialise the Postgres database automatically. If you've run the app before without the `users` table, run `docker compose down -v && docker compose up --build` to recreate it.

### 4. First run

1. Open http://localhost:3000 — you'll be redirected to the login page
2. Click **Sign in with GitHub** and authorise the app
3. Pick a workspace — your personal account or any GitHub org you belong to
4. Go to **Analyze Repos**, paste URLs of existing Terraform repos to extract your conventions
5. Go to **New Service**, describe what you want, click **Bootstrap**

If you skip the analyzer the agent still generates — it just uses sensible defaults instead of your org's conventions.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `JWT_SECRET` | Yes | Secret used to sign session tokens — any long random string |
| `GITHUB_OAUTH_CALLBACK_URL` | No | Defaults to `http://localhost:8000/auth/github/callback` |
| `FRONTEND_URL` | No | Defaults to `http://localhost:3000` |
| `DATABASE_URL` | No | Defaults to the local Docker Postgres instance |

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
| MVP ✓ | GitHub OAuth — personal + org workspace support |
| MVP ✓ | Service catalog — every bootstrapped service tracked per workspace |
| Next | Per-org GitHub token storage (secrets manager) |
| Future | Drift detection — flag repos that diverge from org standards |
| Future | Private module registry support |
