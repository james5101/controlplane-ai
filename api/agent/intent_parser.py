"""
Step 1: Intent Parser

Uses Claude to extract structured intent from a natural language request.
Output drives the Scaffold Planner and Config Hydrator downstream.
"""

import json
import anthropic

client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """
You are an intent parser for an Internal Developer Platform. A developer has described what they
want to build. Extract every meaningful signal from their request into a structured JSON object.

Return a JSON object with EXACTLY these fields:

- stack: the primary tool or framework to use. Examples:
    "terraform" | "cdk" | "pulumi" | "react" | "nextjs" | "express" | "fastapi" | "django"
    Default to "terraform" if the request is infrastructure-focused and no tool is specified.

- cloud: "aws" | "gcp" | "azure" | "none"
    "none" for non-cloud projects (e.g. a React app with no cloud infra specified).

- service_type: the primary service category. Examples:
    "ec2" | "ecs" | "lambda" | "eks" | "cloud_run" | "azure_functions" | "s3_static" | "rds"
    For non-IaC projects use the framework name: "react_app" | "nextjs_app" | "api_server"

- resources: an ordered list of ALL distinct resources or components mentioned or implied.
    For IaC: ["ec2", "s3", "nlb", "rds", "kms", "iam", "vpc", "security_groups"]
    For app projects: ["frontend", "api", "database", "auth", "storage"]
    Be specific — include supporting resources implied by the request (e.g. KMS if CMK is mentioned,
    VPC/subnets if EC2/RDS is mentioned, IAM roles if compute is mentioned).

- environments: list of environment names in deployment order, earliest first.
    Default ["dev", "prod"] if not specified.
    Preserve the exact names the developer used (e.g. "staging" not "stage").

- ci_provider: "github_actions" | "gitlab_ci" | "circleci" | "none"
    Infer from context — if the developer mentions "pipeline", "CI/CD", "GitHub Actions",
    or "deploy" without specifying, default to "github_actions".

- has_promotion_pipeline: boolean. True if the developer mentions promotion between environments,
    approval gates, or a deployment pipeline across multiple environments. Also true if there are
    3+ environments (dev/test/prod pattern implies promotion).

- repo_name_hint: a short, lowercase, hyphenated slug for the repo name. Derive from the service
    or project description. Examples: "payments-api-infra", "user-auth-service", "data-pipeline-gcp"

- notes: a concise string capturing any special requirements not covered by other fields.
    Examples: "CMK encryption required on S3", "NLB not ALB", "t3.micro instance size",
    "manual approval required before prod", "monorepo structure".
    Empty string if nothing notable.

Rules:
- Read between the lines — "CMK" implies a KMS key resource; "NLB" is distinct from "ALB"
- If environments are listed (dev, test, prod) and CI/CD is mentioned, has_promotion_pipeline is true
- Never return null — use empty string for notes, empty list for resources if truly nothing specific
- Return ONLY valid JSON. No markdown fences, no explanation, no preamble.
"""


async def parse_intent(request: str) -> dict:
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": request}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()
    return json.loads(raw)
