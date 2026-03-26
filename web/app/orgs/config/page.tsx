"use client";

import { useEffect, useState } from "react";
import { Save, RefreshCw, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function OrgConfigPage() {
  const [orgId, setOrgId] = useState("my-org");
  const [configYaml, setConfigYaml] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchConfig(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orgs/${id}/config`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConfigYaml(data.config_yaml);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/orgs/${orgId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_yaml: configYaml }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    fetchConfig(orgId);
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Org Config</h1>
          <p className="text-sm text-gray-500 mt-1">
            Edit your org's conventions. Changes take effect on the next bootstrap.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="w-36 h-8 text-xs"
            placeholder="org-id"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchConfig(orgId)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={saving || loading}>
            {saved ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save"}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Editor */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">.controlplane.yaml</CardTitle>
                <Badge variant="neutral">YAML</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <textarea
                value={configYaml}
                onChange={(e) => setConfigYaml(e.target.value)}
                className="w-full h-[600px] font-mono text-xs p-4 bg-gray-950 text-green-400 rounded-b-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                spellCheck={false}
                disabled={loading}
              />
            </CardContent>
          </Card>

          {error && (
            <Card className="mt-3 border-red-200 bg-red-50">
              <CardContent className="py-3">
                <p className="text-xs text-red-600 font-mono">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Schema reference */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Schema Reference</CardTitle>
              <CardDescription>Available config sections</CardDescription>
            </CardHeader>
            <CardContent className="py-3 space-y-4 text-xs text-gray-600">
              {SCHEMA_REFERENCE.map((section) => (
                <div key={section.key}>
                  <p className="font-mono font-semibold text-gray-800">{section.key}</p>
                  <p className="text-gray-500 mt-0.5">{section.description}</p>
                  {section.fields && (
                    <ul className="mt-1.5 space-y-1">
                      {section.fields.map((f) => (
                        <li key={f.name} className="flex gap-1.5">
                          <span className="font-mono text-blue-600 shrink-0">{f.name}</span>
                          <span className="text-gray-400">{f.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const SCHEMA_REFERENCE = [
  {
    key: "org",
    description: "Your organisation slug, used in naming patterns.",
  },
  {
    key: "naming.repo",
    description: "Repo name pattern. Tokens: {service}, {env}",
  },
  {
    key: "naming.resources",
    description: "Per-resource name patterns.",
    fields: [
      { name: "s3_bucket", description: "{org}, {service}, {env}" },
      { name: "ecs_cluster", description: "{service}, {env}" },
      { name: "iam_role", description: "{service}, {env}, {purpose}" },
      { name: "security_group", description: "{service}, {env}" },
    ],
  },
  {
    key: "security",
    description: "Standards applied to all generated resources.",
    fields: [
      { name: "s3.encryption", description: "AES256 or aws:kms" },
      { name: "s3.block_public_access", description: "true / false" },
      { name: "ecs.read_only_root_filesystem", description: "true / false" },
      { name: "ecs.run_as_non_root", description: "true / false" },
      { name: "secrets_backend", description: "aws_secretsmanager or aws_ssm" },
    ],
  },
  {
    key: "backend",
    description: "Terraform state backend (S3 + DynamoDB).",
    fields: [
      { name: "s3_bucket", description: "State bucket name pattern" },
      { name: "dynamodb_table", description: "Lock table name" },
      { name: "key_format", description: "{service}/{environment}/terraform.tfstate" },
    ],
  },
  {
    key: "modules",
    description: "Private module catalog. Key = module type, value = source + version + description.",
  },
  {
    key: "environments",
    description: "Per-environment AWS config.",
    fields: [
      { name: "aws_account_id", description: "12-digit AWS account ID" },
      { name: "aws_region", description: "e.g. us-east-1" },
      { name: "vpc_id", description: "e.g. vpc-abc123" },
      { name: "oidc_role_arn", description: "GitHub Actions OIDC role ARN" },
    ],
  },
  {
    key: "required_tags",
    description: "Tags applied to all provisioned resources.",
  },
];
