"""
Step 2 (was 3): Config Hydrator

Reads the org's config from the database and builds the full context passed
to the generator — naming conventions, security standards, module catalog,
per-environment values, and IaC version.

Falls back to DEFAULT_ORG_CONFIG if no config has been saved for the org yet.
"""

import json

from api.db.connection import get_pool

DEFAULT_ORG_CONFIG = {
    "org": "my-org",
    "naming": {
        "repo": "{service}-infra",
        "resources": {},
    },
    "security": {},
    "iac_tool": "terraform",
    "iac_version": "1.9.0",
    "modules": {},
    "environments": {},
    "required_tags": {
        "ManagedBy": "controlplane-ai",
    },
    "reference_repos": [],
}


def is_config_thin(org_config: dict) -> bool:
    """Return True if the org config looks like it hasn't been customised.

    "Thin" means: no non-default naming, no security rules, no private modules,
    and no environments with real account IDs configured.
    """
    if org_config.get("modules"):
        return False
    security = org_config.get("security", {})
    if security:
        return False
    envs = org_config.get("environments", {})
    if isinstance(envs, dict):
        for env_cfg in envs.values():
            if isinstance(env_cfg, dict) and env_cfg.get("aws_account_id"):
                return False
    naming = org_config.get("naming", {})
    if naming.get("repo", "{service}-infra") != "{service}-infra":
        return False
    return True


async def hydrate_config(org_id: str, intent: dict) -> dict:
    org_config = await _fetch_org_config(org_id)
    repo_name = _build_repo_name(intent, org_config)

    return {
        "intent": intent,
        "org_config": org_config,
        "params": {
            "org": org_config.get("org", "my-org"),
            "repo_name": repo_name,
            "service_name": intent.get("repo_name_hint", "my-service"),
            "environments": intent.get("environments", ["dev", "prod"]),
            "iac_version": org_config.get("iac_version") or org_config.get("terraform_version", "1.9.0"),
            "naming": org_config.get("naming", {}),
            "security": org_config.get("security", {}),
            "modules": org_config.get("modules", {}),
            "environment_config": _build_environment_config(
                org_config.get("environments", {}),
                intent.get("environments", ["dev", "prod"]),
            ),
            "required_tags": org_config.get("required_tags", {"ManagedBy": "controlplane-ai"}),
        },
    }


async def _fetch_org_config(org_id: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT config FROM org_configs WHERE org_id = $1", org_id
    )
    if row:
        return json.loads(row["config"])
    return DEFAULT_ORG_CONFIG


def _build_environment_config(org_envs, requested_envs: list) -> dict:
    """Return per-env config for each requested env, with an empty dict fallback.
    org_envs may be a dict (old format) or a list of names (new analyzer format).
    """
    if isinstance(org_envs, list):
        org_envs = {}
    return {env: org_envs.get(env, {}) for env in requested_envs}


def _build_repo_name(intent: dict, org_config: dict) -> str:
    hint = intent.get("repo_name_hint", "my-service")
    pattern = org_config.get("naming", {}).get("repo", "{service}-infra")
    return pattern.replace("{service}", hint).replace("{env}", "infra")
