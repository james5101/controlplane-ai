"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest, GitBranch, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepProgress, type Step } from "@/components/step-progress";
import type { BootstrapResponse } from "@/lib/api";

const STEP_ORDER = [
  "intent_parser",
  "template_selector",
  "config_hydrator",
  "generator",
  "github_pusher",
];

function buildSteps(result: BootstrapResponse | null): Step[] {
  return STEP_ORDER.map((id, i) => {
    if (!result) {
      return { id, label: id, description: "", status: "pending" };
    }

    const match = result.steps.find((s) => s.step === id);
    if (!match) {
      return { id, label: id, description: "", status: "pending" };
    }

    return {
      id,
      label: id,
      description: "",
      status: "done",
      output: match.output,
    };
  });
}

export default function BootstrapProgressPage() {
  const [result, setResult] = useState<BootstrapResponse | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("bootstrap_result");
    if (stored) {
      setResult(JSON.parse(stored));
    }
  }, []);

  const steps = buildSteps(result);
  const done = result !== null;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bootstrapping...</h1>
        <p className="text-sm text-gray-500 mt-1">
          ControlPlane AI is generating your infrastructure scaffold.
        </p>
      </div>

      <div className="space-y-6">
        <StepProgress steps={steps} />

        {done && result && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-green-800">Repository Ready</CardTitle>
              </div>
              <CardDescription className="text-green-700">
                Your scaffold has been committed and a PR is open for review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href={result.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-green-700 hover:underline"
              >
                <GitBranch className="h-4 w-4" />
                {result.repo_url}
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={result.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-green-700 hover:underline"
              >
                <GitPullRequest className="h-4 w-4" />
                View Pull Request
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}

        {!result && (
          <Card className="border-gray-200">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-gray-400">
                No active bootstrap session. <a href="/new" className="text-blue-500 hover:underline">Start a new one.</a>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
