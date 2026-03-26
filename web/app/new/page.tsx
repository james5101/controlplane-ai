"use client";

import { useState } from "react";
import { Sparkles, ChevronRight, ExternalLink } from "lucide-react";
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
import { streamBootstrap } from "@/lib/api";
import { StepProgress, Step, StepStatus } from "@/components/step-progress";

const EXAMPLES = [
  "Terraform repo for an ECS service in AWS with dev and prod environments, GitHub Actions pipeline",
  "AWS Lambda function with API Gateway, single prod environment, GitHub Actions",
  "EKS cluster on AWS with dev, staging, and prod environments",
];

const PIPELINE_STEPS = ["intent_parser", "config_hydrator", "generator", "github_pusher"];

function makeInitialSteps(): Step[] {
  return PIPELINE_STEPS.map((id) => ({
    id,
    label: id,
    description: "",
    status: "pending" as StepStatus,
  }));
}

type PageState = "form" | "progress";

export default function NewServicePage() {
  const [pageState, setPageState] = useState<PageState>("form");
  const [request, setRequest] = useState("");
  const [steps, setSteps] = useState<Step[]>(makeInitialSteps());
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateStepStatus(stepId: string, status: StepStatus, output?: Record<string, unknown>) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, status, ...(output !== undefined ? { output } : {}) } : s
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;

    setSteps(makeInitialSteps());
    setRepoUrl(null);
    setPrUrl(null);
    setError(null);
    setPageState("progress");

    try {
      await streamBootstrap({ request }, (event) => {
        const ev = event as Record<string, unknown>;
        const step = ev.step as string | undefined;
        const status = ev.status as string | undefined;

        if (!step) return;

        if (step === "complete") {
          setRepoUrl(ev.repo_url as string);
          setPrUrl(ev.pr_url as string);
          return;
        }

        if (step === "error") {
          setError((ev.message as string) ?? "An unexpected error occurred");
          // Mark the currently running step as error
          setSteps((prev) =>
            prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
          );
          return;
        }

        if (status === "running") {
          updateStepStatus(step, "running");
        } else if (status === "done") {
          const output = ev.output as Record<string, unknown> | undefined;
          updateStepStatus(step, "done", output);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
      );
    }
  }

  function handleReset() {
    setPageState("form");
    setSteps(makeInitialSteps());
    setRepoUrl(null);
    setPrUrl(null);
    setError(null);
  }

  // ── Form state ──────────────────────────────────────────────────────────────
  if (pageState === "form") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">New Service</h1>
          <p className="text-sm text-gray-500 mt-1">
            Describe what you need in plain English. ControlPlane AI will bootstrap a
            production-ready repo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What do you want to build?</CardTitle>
              <CardDescription>
                Mention the cloud provider, service type, environments, and any other
                requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Terraform repo for an ECS service in AWS with dev and prod environments, GitHub Actions pipeline"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="min-h-[120px]"
              />

              {/* Examples */}
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
                Bootstrap
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    );
  }

  // ── Progress state ──────────────────────────────────────────────────────────
  const isComplete = !!repoUrl;
  const hasError = !!error;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bootstrapping…</h1>
        <p className="text-sm text-gray-500 mt-1 truncate">
          {request}
        </p>
      </div>

      <StepProgress steps={steps} />

      {/* Result links */}
      {isComplete && (
        <Card className="mt-6 border-green-200 bg-green-50">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">Your repo is ready!</p>
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
      )}

      {/* Error state */}
      {hasError && (
        <Card className="mt-6 border-red-200 bg-red-50">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm text-red-700">{error}</p>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
