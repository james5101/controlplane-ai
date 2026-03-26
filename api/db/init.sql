CREATE TABLE IF NOT EXISTS org_configs (
    org_id TEXT PRIMARY KEY,
    config  JSONB        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
