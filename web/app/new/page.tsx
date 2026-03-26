"use client";

import { useState } from "react";
import { Sparkles, ChevronRight, ExternalLink, FileText, CheckCircle2, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { planService, streamGenerate, streamPublish, ManifestEntry } from "@/lib/api";
import { StepProgress, Step, StepStatus } from "@/components/step-progress";

const EXAMPLES = [
  "Terraform repo for an ECS service in AWS with dev and prod environments, GitHub Actions pipeline",
  "AWS Lambda function with API Gateway, single prod environment, GitHub Actions",
  "EKS cluster on AWS with dev, staging, and prod environments",
];

function makeStep(id: string): Step {
  return { id, label: id, description: "", status: "pending" as StepStatus };
}

type PageState =
  | "form"
  | "planning"
  | "plan_review"
  | "generating"
  | "files_review"
  | "publishing"
  | "complete"
  | "error";

// ── Manifest preview grouped by group name ───────────────────────────────────
function ManifestPreview({ manifest }: { manifest: ManifestEntry[] }) {
  const groups: Record<string, ManifestEntry[]> = {};
  for (const entry of manifest) {
    (groups[entry.group] ??= []).push(entry);
  }
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([group, entries]) => (
        <div key={group}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {group}
          </p>
          <div className="space-y-1">
            {entries.map((e) => (
              <div key={e.path} className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-mono text-gray-800">{e.path}</span>
                  <p className="text-xs text-gray-500">{e.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Generated file list grouped by directory ─────────────────────────────────
function FileList({ files }: { files: string[] }) {
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const dir = f.includes("/") ? f.split("/").slice(0, -1).join("/") : "(root)";
    (groups[dir] ??= []).push(f);
  }
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([dir, paths]) => (
        <div key={dir}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {dir}
          </p>
          <div className="flex flex-wrap gap-1">
            {paths.map((p) => (
              <span
                key={p}
                className="bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 font-mono text-[10px]"
              >
                {p.split("/").pop()}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NewServicePage() {
  const [pageState, setPageState] = useState<PageState>("form");
  const [request, setRequest] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);
  const [generateStep, setGenerateStep] = useState<Step>(makeStep("generator"));
  const [generateProgress, setGenerateProgress] = useState<string | null>(null);
  const [lastStableState, setLastStableState] = useState<PageState>("form");
  const [publishSteps, setPublishSteps] = useState<Step[]>([
    makeStep("runbook_generator"),
    makeStep("github_pusher"),
  ]);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateStep<T extends Step>(setter: React.Dispatch<React.SetStateAction<T>>, patch: Partial<T>) {
    setter((prev) => ({ ...prev, ...patch }));
  }

  function updateStepInList(
    setter: React.Dispatch<React.SetStateAction<Step[]>>,
    id: string,
    patch: Partial<Step>
  ) {
    setter((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleReset() {
    setPageState("form");
    setLastStableState("form");
    setSessionId(null);
    setManifest([]);
    setGeneratedFiles([]);
    setGenerateStep(makeStep("generator"));
    setGenerateProgress(null);
    setPublishSteps([makeStep("runbook_generator"), makeStep("github_pusher")]);
    setRepoUrl(null);
    setPrUrl(null);
    setError(null);
  }

  function handleRetry() {
    setError(null);
    setGenerateStep(makeStep("generator"));
    setGenerateProgress(null);
    setPublishSteps([makeStep("runbook_generator"), makeStep("github_pusher")]);
    setPageState(lastStableState);
  }

  // ── Phase 1: Plan ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;

    setError(null);
    setPageState("planning");

    try {
      const result = await planService({ request });
      setSessionId(result.session_id);
      setManifest(result.manifest);
      setPageState("plan_review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
      setPageState("error");
    }
  }

  // ── Phase 2: Generate ────────────────────────────────────────────────────────
  async function handleApproveAndGenerate() {
    if (!sessionId) return;
    setLastStableState("plan_review");
    setGenerateStep(makeStep("generator"));
    setPageState("generating");

    try {
      await streamGenerate(sessionId, (event) => {
        const ev = event as Record<string, unknown>;
        const step = ev.step as string;
        const status = ev.status as string;

        if (step === "error") {
          setError((ev.message as string) ?? "Generation failed");
          updateStep(setGenerateStep, { status: "error" });
          setPageState("error");
          return;
        }

        if (step === "generator") {
          if (status === "running") {
            updateStep(setGenerateStep, { status: "running" });
          } else if (status === "progress") {
            if (ev.type === "layer_start") {
              const groups = ev.groups as string[];
              setGenerateProgress(`Layer ${ev.layer}/${ev.total_layers} — ${groups.join(", ")}`);
            } else if (ev.type === "batch_done") {
              setGenerateProgress(`Batch ${ev.batch}/${ev.total_batches} done — ${ev.group}`);
            }
          } else if (status === "done") {
            const files = (ev.output as { files: string[] } | undefined)?.files ?? [];
            updateStep(setGenerateStep, { status: "done", output: { files } });
            setGeneratedFiles(files);
            setGenerateProgress(null);
          }
        }
      });

      // If we got here without an error event, move to review
      setPageState((prev) => (prev === "generating" ? "files_review" : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      updateStep(setGenerateStep, { status: "error" });
      setPageState("error");
    }
  }

  // ── Phase 3: Publish ─────────────────────────────────────────────────────────
  async function handleApproveAndPublish() {
    if (!sessionId) return;
    setLastStableState("files_review");
    setPublishSteps([makeStep("runbook_generator"), makeStep("github_pusher")]);
    setPageState("publishing");

    try {
      await streamPublish(sessionId, (event) => {
        const ev = event as Record<string, unknown>;
        const step = ev.step as string;
        const status = ev.status as string;

        if (step === "error") {
          setError((ev.message as string) ?? "Publish failed");
          setPublishSteps((prev) =>
            prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
          );
          setPageState("error");
          return;
        }

        if (step === "complete") {
          setRepoUrl(ev.repo_url as string);
          setPrUrl(ev.pr_url as string);
          setPageState("complete");
          return;
        }

        if (status === "running") {
          updateStepInList(setPublishSteps, step, { status: "running" });
        } else if (status === "done") {
          updateStepInList(setPublishSteps, step, { status: "done" });
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setPageState("error");
    }
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  if (pageState === "form") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">New Service</h1>
          <p className="text-sm text-gray-500 mt-1">
            Describe what you need in plain English. ControlPlane AI will plan the scaffold
            and ask you to approve before generating or pushing anything.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What do you want to build?</CardTitle>
              <CardDescription>
                Mention the cloud provider, service type, environments, and any other requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Terraform repo for an ECS service in AWS with dev and prod environments, GitHub Actions pipeline"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="min-h-[120px]"
              />
              <div>
                <p className="text-xs text-gray-400 mb-2">Examples:</p>
                <div className="space-y-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setRequest(ex)}
                      className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                    >
                      <ChevronRight className="inline h-3 w-3 mr-0.5" />
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" disabled={!request.trim()}>
                <Sparkles className="h-4 w-4" />
                Plan scaffold
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    );
  }

  // ── Planning spinner ──────────────────────────────────────────────────────────
  if (pageState === "planning") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Planning scaffold…</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{request}</p>
        </div>
        <StepProgress
          steps={[
            { id: "intent_parser", label: "intent_parser", description: "", status: "done" },
            { id: "config_hydrator", label: "config_hydrator", description: "", status: "done" },
            { id: "scaffold_planner", label: "scaffold_planner", description: "", status: "running" },
          ]}
        />
      </div>
    );
  }

  // ── Plan review ───────────────────────────────────────────────────────────────
  if (pageState === "plan_review") {
    const groupCount = new Set(manifest.map((e) => e.group)).size;
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review scaffold plan</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{request}</p>
        </div>

        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">{manifest.length} files</span> across{" "}
              <span className="font-semibold">{groupCount} groups</span> planned.
              Review the structure below and approve to start generating file content.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Planned file structure</CardTitle>
          </CardHeader>
          <CardContent className="py-3 max-h-96 overflow-y-auto">
            <ManifestPreview manifest={manifest} />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleApproveAndGenerate}>
            <CheckCircle2 className="h-4 w-4" />
            Approve &amp; generate files
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Generating ────────────────────────────────────────────────────────────────
  if (pageState === "generating") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Generating files…</h1>
          <p className="text-sm text-gray-500 mt-1">
            Writing {manifest.length} files in parallel layers.
          </p>
        </div>
        <StepProgress steps={[generateStep]} />
        {generateProgress && (
          <p className="mt-3 text-xs text-gray-500 font-mono">{generateProgress}</p>
        )}
      </div>
    );
  }

  // ── Files review ──────────────────────────────────────────────────────────────
  if (pageState === "files_review") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review generated files</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{request}</p>
        </div>

        <Card className="mb-4 border-green-200 bg-green-50">
          <CardContent className="py-3">
            <p className="text-sm text-green-800">
              <span className="font-semibold">{generatedFiles.length} files generated.</span>{" "}
              Approve to generate the runbook and push everything to GitHub.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Generated files</CardTitle>
          </CardHeader>
          <CardContent className="py-3 max-h-80 overflow-y-auto">
            <FileList files={generatedFiles} />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleApproveAndPublish}>
            <CheckCircle2 className="h-4 w-4" />
            Approve &amp; push to GitHub
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Publishing ────────────────────────────────────────────────────────────────
  if (pageState === "publishing") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Publishing to GitHub…</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{request}</p>
        </div>
        <StepProgress steps={publishSteps} />
      </div>
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────────
  if (pageState === "complete") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Your repo is ready!</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{request}</p>
        </div>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 space-y-2">
            <div className="flex flex-col gap-1.5">
              <a
                href={repoUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View repository
              </a>
              {prUrl && (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View pull request
                </a>
              )}
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Bootstrap another service
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  const retryLabel: Record<PageState, string> = {
    form: "Start over",
    planning: "Start over",
    plan_review: "Back to plan review",
    generating: "Back to plan review",
    files_review: "Back to file review",
    publishing: "Back to file review",
    complete: "Start over",
    error: "Start over",
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
      </div>
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-4 space-y-3">
          <p className="text-sm text-red-700">{error}</p>
          <div className="flex gap-2">
            {lastStableState !== "form" && (
              <Button size="sm" onClick={handleRetry}>
                {retryLabel[lastStableState]}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              Start over
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
