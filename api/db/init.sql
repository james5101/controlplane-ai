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
