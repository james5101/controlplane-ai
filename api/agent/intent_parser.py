"""
Step 1: Intent Parser

Uses Claude to extract structured intent from a natural language request.
Output drives template selection and config hydration downstream.
"""

import json
import anthropic

client = anthropic.AsyncAnthropic()

SYSTEM_PROMPT = """
You are an infrastructure intent parser for an Internal Developer Platform.
Extract structured intent from natural language infrastructure requests.

Return a JSON object with these fields:
- cloud: "aws" | "gcp" | "azure"
- service_type: e.g. "ecs", "lambda", "eks", "cloud_run"
- environments: list of environment names, e.g. ["dev", "prod"]
- ci_provider: "github_actions" | "gitlab_ci" | "none"
- repo_name_hint: a suggested repo name slug based on the request
- notes: any additional context to pass to downstream steps

Return only valid JSON, no explanation.
"""


async def parse_intent(request: str) -> dict:
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": request}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()
    return json.loads(raw)
