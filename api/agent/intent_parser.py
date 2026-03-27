"""
Step 1: Intent Parser

Uses Claude tool use to extract structured intent from a natural language request.
Tool use forces a typed response — no JSON parsing, no markdown stripping, no fragile cleanup.
Output drives the Scaffold Planner and Config Hydrator downstream.
"""

import anthropic

client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """
You are an intent parser for an Internal Developer Platform. A developer has described what they
want to build. Extract every meaningful signal from their request into a structured intent.

Rules:
- stack: default to "terraform" if the request is infrastructure-focused and no tool is specified
- cloud: use "none" for non-cloud projects (e.g. a React app with no cloud infra specified)
- service_type: for non-IaC projects use the framework name — "react_app", "nextjs_app", "api_server"
- resources: include ALL distinct resources mentioned or implied — if CMK is mentioned include "kms";
  if EC2/RDS is mentioned include "vpc" and "iam"; be specific and complete
- environments: preserve the exact names the developer used ("staging" not "stage");
  default to ["dev", "prod"] if not specified
- ci_provider: if the developer mentions "pipeline", "CI/CD", or "deploy" without specifying,
  default to "github_actions"
- has_promotion_pipeline: true if 3+ environments, or if promotion gates / approvals are mentioned
- repo_name_hint: short, lowercase, hyphenated slug — e.g. "payments-api-infra", "data-pipeline-gcp"
- notes: capture special requirements not covered by other fields — empty string if nothing notable
"""

_INTENT_TOOL = {
    "name": "submit_intent",
    "description": "Submit the extracted intent from the developer's infrastructure request.",
    "input_schema": {
        "type": "object",
        "properties": {
            "stack": {
                "type": "string",
                "enum": ["terraform", "cdk", "pulumi", "react", "nextjs", "express", "fastapi", "django"],
                "description": "The primary IaC tool or framework.",
            },
            "cloud": {
                "type": "string",
                "enum": ["aws", "gcp", "azure", "none"],
            },
            "service_type": {
                "type": "string",
                "description": (
                    "Primary service category. IaC examples: ec2, ecs, lambda, eks, cloud_run, "
                    "azure_functions, s3_static, rds. App examples: react_app, nextjs_app, api_server."
                ),
            },
            "resources": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Ordered list of ALL distinct resources or components mentioned or implied. "
                    "IaC example: [\"ec2\", \"s3\", \"nlb\", \"rds\", \"kms\", \"iam\", \"vpc\"]. "
                    "App example: [\"frontend\", \"api\", \"database\", \"auth\"]."
                ),
            },
            "environments": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Environment names in deployment order, earliest first.",
            },
            "ci_provider": {
                "type": "string",
                "enum": ["github_actions", "gitlab_ci", "circleci", "none"],
            },
            "has_promotion_pipeline": {
                "type": "boolean",
                "description": (
                    "True if 3+ environments, or if the developer mentions promotion gates, "
                    "approval steps, or a multi-environment deployment pipeline."
                ),
            },
            "repo_name_hint": {
                "type": "string",
                "description": "Short lowercase hyphenated slug for the repo name.",
            },
            "notes": {
                "type": "string",
                "description": (
                    "Special requirements not captured by other fields — e.g. "
                    "'CMK encryption required on S3', 'NLB not ALB', 't3.micro instance size'. "
                    "Empty string if nothing notable."
                ),
            },
        },
        "required": [
            "stack", "cloud", "service_type", "resources", "environments",
            "ci_provider", "has_promotion_pipeline", "repo_name_hint", "notes",
        ],
    },
}


async def parse_intent(request: str) -> dict:
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        tools=[_INTENT_TOOL],
        tool_choice={"type": "tool", "name": "submit_intent"},
        messages=[{"role": "user", "content": request}],
    )
    return message.content[0].input
