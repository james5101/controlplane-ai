CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    github_id   INTEGER UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    email       TEXT,
    avatar_url  TEXT,
    github_token TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_configs (
    org_id TEXT PRIMARY KEY,
    config  JSONB        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bootstrapped_services (
    id                    SERIAL PRIMARY KEY,
    org_id                TEXT NOT NULL,
    repo_name             TEXT NOT NULL,
    repo_url              TEXT NOT NULL,
    pr_url                TEXT NOT NULL,
    cloud                 TEXT,
    service_type          TEXT,
    environments          TEXT[],
    original_request      TEXT,
    runbook_md            TEXT,
    runbook_generated_at  TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
