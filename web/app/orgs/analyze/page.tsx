"use client";

import { useState } from "react";
import { Plus, Trash2, Search, CheckCircle2, AlertCircle, ChevronRight, Tag, Layers, GitBranch, Boxes, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { streamAnalyzeRepos, saveOrgConfig } from "@/lib/api";
import yaml from "js-yaml";

type Step = "repos" | "preview" | "done";

interface InferredConfig {
  org?: string;
  iac_tool?: string;
  iac_version?: string;
  naming?: { repo?: string; resources?: Record<string, string> };
  environments?: string[];
  required_tags?: Record<string, string>;
  modules?: Record<string, { source: string; version?: string; description?: string }>;
  ci?: { provider?: string; auth_method?: string; terraform_version_pinned?: boolean };
  security?: Record<string, string>;
}

interface AnalysisResult {
  inferred_config: InferredConfig;
  sources: Record<string, string>;
  notes: string[];
  repos_scanned: string[];
}

export default function AnalyzeReposPage() {
  const [orgId, setOrgId] = useState("my-org");
  const [repoUrls, setRepoUrls] = useState<string[]>(["", ""]);
  const [step, setStep] = useState<Step>("repos");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [scanLog, setScanLog] = useState<string[]>([]);
  // Editable overrides for gap fields
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  function addRepo() { setRepoUrls(p => [...p, ""]); }
  function removeRepo(i: number) { setRepoUrls(p => p.filter((_, idx) => idx !== i)); }
  function updateRepo(i: number, v: string) { setRepoUrls(p => p.map((u, idx) => idx === i ? v : u)); }

  async function runAnalysis() {
    const urls = repoUrls.filter(u => u.trim());
    if (!urls.length) { setError("Add at least one repo URL."); return; }
    setLoading(true);
    setError(null);
    setScanLog([]);
    try {
      await streamAnalyzeRepos(orgId, { repo_urls: urls }, (event) => {
        const ev = event as Record<string, unknown>;
        const status = ev.status as string | undefined;
        if (status === "running") {
          setScanLog(prev => [...prev, ev.message as string]);
        } else if (status === "done") {
          const data = ev.result as AnalysisResult;
          setResult(data);
          setOverrides({});
          setStep("preview");
        } else if (status === "error") {
          setError((ev.message as string) ?? "Analysis failed");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function applyConfig() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      // Merge overrides back into inferred config before saving
      const merged = mergeOverrides(result.inferred_config, overrides);
      const configYaml = yaml.dump(merged, { sortKeys: false, lineWidth: 120 });
      await saveOrgConfig(orgId, configYaml);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  const validUrls = repoUrls.filter(u => u.trim()).length;
  const gapCount = result ? countGaps(result.inferred_config) - Object.keys(overrides).filter(k => overrides[k].trim()).length : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyze Existing Repos</h1>
          <p className="text-sm text-gray-500 mt-1">
            We scan your existing IaC repos and pull out the conventions that matter —
            naming patterns, required tags, module sources, and more.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">Org ID</span>
          <Input value={orgId} onChange={e => setOrgId(e.target.value)} className="w-32 h-8 text-xs" placeholder="org-id" />
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {(["repos", "preview", "done"] as Step[]).map((s, i) => {
          const labels = { repos: "Select Repos", preview: "Review Findings", done: "Applied" };
          const current = ["repos", "preview", "done"].indexOf(step);
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center rounded-full text-xs font-medium w-7 h-7 ${
                i < current ? "bg-green-100 text-green-700" : i === current ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
              }`}>
                {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={i === current ? "text-gray-800 font-medium" : "text-gray-400"}>{labels[s]}</span>
              {i < 2 && <ChevronRight className="h-4 w-4 text-gray-300" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Repo URLs */}
      {step === "repos" && (
        <Card>
          <CardHeader>
            <CardTitle>Repo URLs</CardTitle>
            <CardDescription>
              Add 1–5 of your existing infrastructure repos. More examples give better pattern extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {repoUrls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={url}
                  onChange={e => updateRepo(i, e.target.value)}
                  placeholder="https://github.com/acme/payments-infra"
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={() => removeRepo(i)} disabled={repoUrls.length <= 1} className="shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRepo} disabled={repoUrls.length >= 5} className="mt-1">
              <Plus className="h-4 w-4 mr-1" /> Add repo
            </Button>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-xs text-gray-400">{validUrls} repo{validUrls !== 1 ? "s" : ""} ready to scan</span>
            <Button onClick={runAnalysis} disabled={loading || validUrls === 0}>
              <Search className={`h-4 w-4 mr-2 ${loading ? "animate-pulse" : ""}`} />
              {loading ? "Scanning…" : "Scan Repos"}
            </Button>
          </CardFooter>
          {scanLog.length > 0 && (
            <div className="px-6 pb-4 space-y-1">
              {scanLog.map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                  {i === scanLog.length - 1 && loading ? (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  {msg}
                </div>
              ))}
            </div>
          )}
          {error && <div className="px-6 pb-4 text-xs text-red-600 font-mono">{error}</div>}
        </Card>
      )}

      {/* Step 2: Structured preview */}
      {step === "preview" && result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {result.repos_scanned.map(r => (
                <Badge key={r} variant="neutral" className="font-mono text-xs">{r}</Badge>
              ))}
            </div>
            {gapCount > 0 && (
              <span className="text-xs text-amber-600 font-medium">{gapCount} gap{gapCount !== 1 ? "s" : ""} to fill</span>
            )}
          </div>

          <div className="space-y-3">
            <ToolingSection config={result.inferred_config} sources={result.sources} overrides={overrides} setOverrides={setOverrides} />
            <NamingSection config={result.inferred_config} sources={result.sources} overrides={overrides} setOverrides={setOverrides} />
            <EnvironmentsSection config={result.inferred_config} sources={result.sources} overrides={overrides} setOverrides={setOverrides} />
            <TagsSection config={result.inferred_config} sources={result.sources} overrides={overrides} setOverrides={setOverrides} />
            <ModulesSection config={result.inferred_config} sources={result.sources} />
            <CISection config={result.inferred_config} sources={result.sources} />
          </div>

          {/* Notes */}
          {result.notes.length > 0 && (
            <Card className="bg-gray-50">
              <CardHeader className="py-3">
                <CardTitle className="text-xs text-gray-500 uppercase tracking-wide">Analysis notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {result.notes.map((note, i) => {
                  const isGap = /gap|could not|not found|missing|unclear|unable|unknown/i.test(note);
                  return (
                    <div key={i} className="flex gap-2 text-xs">
                      {isGap
                        ? <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />}
                      <span className={isGap ? "text-amber-700" : "text-gray-600"}>{note}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {error && <p className="text-xs text-red-600 font-mono">{error}</p>}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("repos")}>Back</Button>
            <Button onClick={applyConfig} disabled={saving}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {saving ? "Saving…" : "Apply as Org Config"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === "done" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-semibold text-green-800">Conventions applied</p>
            <p className="text-sm text-green-700">
              Every scaffold generated for <strong>{orgId}</strong> will now follow these patterns.
              {" "}<a href="/orgs/config" className="underline">Edit in Org Config</a> to fine-tune further.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Section components ────────────────────────────────────────────────────────

interface SectionProps {
  config: InferredConfig;
  sources: Record<string, string>;
  overrides?: Record<string, string>;
  setOverrides?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}

function SectionShell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value, source, fieldKey, overrides, setOverrides }: {
  label: string;
  value?: string | null;
  source?: string;
  fieldKey?: string;
  overrides?: Record<string, string>;
  setOverrides?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const override = fieldKey && overrides ? overrides[fieldKey] : undefined;
  const displayValue = override ?? value;
  const isMissing = !displayValue;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-500 w-40 shrink-0 text-xs">{label}</span>
      {isMissing && setOverrides && fieldKey ? (
        <Input
          placeholder="enter value…"
          value={override ?? ""}
          onChange={e => setOverrides(p => ({ ...p, [fieldKey]: e.target.value }))}
          className="h-7 text-xs w-48 border-amber-300 focus:border-amber-500"
        />
      ) : (
        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-800">{displayValue}</code>
      )}
      {isMissing && !setOverrides && <span className="text-xs text-amber-500">not found</span>}
      {source && !isMissing && (
        <span className="text-xs text-gray-400 truncate max-w-[180px]" title={source}>← {source}</span>
      )}
      {isMissing && <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
    </div>
  );
}

function ToolingSection({ config, sources, overrides, setOverrides }: SectionProps) {
  return (
    <SectionShell icon={<Boxes className="h-4 w-4 text-blue-500" />} title="IaC Tooling">
      <Field label="Tool" value={config.iac_tool} source={sources["iac_tool"]} />
      <Field label="Version" value={config.iac_version} source={sources["iac_version"]}
        fieldKey="iac_version" overrides={overrides} setOverrides={setOverrides} />
      <Field label="Org slug" value={config.org} source={sources["org"]}
        fieldKey="org" overrides={overrides} setOverrides={setOverrides} />
    </SectionShell>
  );
}

function NamingSection({ config, sources, overrides, setOverrides }: SectionProps) {
  const resources = config.naming?.resources ?? {};
  return (
    <SectionShell icon={<Layers className="h-4 w-4 text-purple-500" />} title="Naming Conventions">
      <Field label="Repo pattern" value={config.naming?.repo} source={sources["naming.repo"]}
        fieldKey="naming.repo" overrides={overrides} setOverrides={setOverrides} />
      {Object.entries(resources).map(([type, pattern]) => (
        <Field key={type} label={type} value={pattern} source={sources["naming.resources"]} />
      ))}
      {!config.naming?.repo && Object.keys(resources).length === 0 && (
        <p className="text-xs text-amber-600">No naming patterns found — you may want to set these manually.</p>
      )}
    </SectionShell>
  );
}

function EnvironmentsSection({ config, sources, overrides, setOverrides }: SectionProps) {
  const envs = config.environments ?? [];
  return (
    <SectionShell icon={<GitBranch className="h-4 w-4 text-green-500" />} title="Environments">
      {envs.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {envs.map(e => (
            <Badge key={e} variant="neutral" className="font-mono text-xs">{e}</Badge>
          ))}
          {sources["environments"] && (
            <span className="text-xs text-gray-400 self-center">← {sources["environments"]}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-amber-600">No environments detected. Common values: dev, staging, prod.</p>
      )}
    </SectionShell>
  );
}

function TagsSection({ config, sources, overrides, setOverrides }: SectionProps) {
  const tags = config.required_tags ?? {};
  return (
    <SectionShell icon={<Tag className="h-4 w-4 text-orange-500" />} title="Required Tags">
      {Object.keys(tags).length > 0 ? (
        Object.entries(tags).map(([key, value]) => (
          <Field key={key} label={key} value={value || "(dynamic)"} source={sources["required_tags"]} />
        ))
      ) : (
        <p className="text-xs text-amber-600">No required tags found in the repos.</p>
      )}
    </SectionShell>
  );
}

function ModulesSection({ config, sources }: { config: InferredConfig; sources: Record<string, string> }) {
  const modules = config.modules ?? {};
  if (Object.keys(modules).length === 0) return null;
  return (
    <SectionShell icon={<Boxes className="h-4 w-4 text-indigo-500" />} title="Module Sources">
      {Object.entries(modules).map(([key, mod]) => (
        <div key={key} className="text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-medium">{key}</code>
            <span className="text-gray-400">v{mod.version ?? "?"}</span>
            {sources["modules"] && <span className="text-gray-400">← {sources["modules"]}</span>}
          </div>
          <div className="text-gray-500 pl-2">{mod.source}</div>
          {mod.description && <div className="text-gray-400 pl-2">{mod.description}</div>}
        </div>
      ))}
    </SectionShell>
  );
}

function CISection({ config, sources }: { config: InferredConfig; sources: Record<string, string> }) {
  const ci = config.ci;
  if (!ci) return null;
  return (
    <SectionShell icon={<Shield className="h-4 w-4 text-gray-500" />} title="CI / CD">
      <Field label="Provider" value={ci.provider} source={sources["ci.provider"]} />
      <Field label="Auth method" value={ci.auth_method} source={sources["ci.auth_method"]} />
      <Field label="Version pinned" value={ci.terraform_version_pinned ? "yes" : "no"} />
    </SectionShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countGaps(config: InferredConfig): number {
  let gaps = 0;
  if (!config.org) gaps++;
  if (!config.iac_version) gaps++;
  if (!config.naming?.repo) gaps++;
  if (!config.environments?.length) gaps++;
  return gaps;
}

function mergeOverrides(config: InferredConfig, overrides: Record<string, string>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!value.trim()) continue;
    const parts = key.split(".");
    let node = out as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}
