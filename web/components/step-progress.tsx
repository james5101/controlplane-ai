import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface Step {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  output?: Record<string, unknown>;
}

const STEP_LABELS: Record<string, { label: string; description: string }> = {
  intent_parser: {
    label: "Parse Request",
    description: "Extracting cloud, stack, resources, environments, and CI/CD requirements",
  },
  config_hydrator: {
    label: "Load Org Config",
    description: "Applying your org's naming conventions, security standards, and module catalog",
  },
  scaffold_planner: {
    label: "Plan Structure",
    description: "Designing the repository layout following best practices for the detected stack",
  },
  generator: {
    label: "Generate Files",
    description: "Writing every file in dependency order — this usually takes 30–60 seconds",
  },
  runbook_generator: {
    label: "Generate Runbook",
    description: "Synthesising an operational runbook from the generated infrastructure",
  },
  github_pusher: {
    label: "Push to GitHub",
    description: "Creating the repository, committing all files, and opening a PR",
  },
};

function StepOutput({ stepId, output }: { stepId: string; output: Record<string, unknown> }) {
  // Scaffold planner: show group count + file count
  if (stepId === "scaffold_planner") {
    const groups = output.groups as string[] | undefined;
    const files = output.files as number | undefined;
    return (
      <div className="text-xs text-gray-600 space-y-1">
        <p><span className="font-medium">{files}</span> files planned across <span className="font-medium">{groups?.length}</span> groups</p>
        {groups && (
          <div className="flex flex-wrap gap-1 mt-1">
            {groups.map((g) => (
              <span key={g} className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px]">{g}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Generator: show file list
  if (stepId === "generator" || stepId === "intent_parser") {
    const files = output.files as string[] | undefined;
    if (files && Array.isArray(files)) {
      return (
        <div className="text-xs text-gray-600">
          <p className="font-medium mb-1">{files.length} files generated</p>
          <div className="flex flex-wrap gap-1">
            {files.map((f) => (
              <span key={f} className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px]">{f}</span>
            ))}
          </div>
        </div>
      );
    }
  }

  // Default: compact JSON
  return (
    <pre className="text-xs bg-gray-50 rounded-md p-3 overflow-x-auto text-gray-700 border border-gray-100">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />;
  if (status === "running")
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />;
  if (status === "error")
    return <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
  return <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />;
}

function statusBadgeVariant(status: StepStatus) {
  if (status === "done") return "success" as const;
  if (status === "running") return "running" as const;
  if (status === "error") return "error" as const;
  return "neutral" as const;
}

function statusLabel(status: StepStatus) {
  if (status === "done") return "Done";
  if (status === "running") return "Running";
  if (status === "error") return "Error";
  return "Pending";
}

export function StepProgress({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const meta = STEP_LABELS[step.id] ?? {
          label: step.label,
          description: "",
        };
        return (
          <div key={step.id} className="flex gap-4">
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} />
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "w-px flex-1 mt-1",
                    step.status === "done" ? "bg-green-200" : "bg-gray-200"
                  )}
                />
              )}
            </div>

            {/* Card */}
            <div className="flex-1 pb-3">
              <Card
                className={cn(
                  "transition-all",
                  step.status === "running" && "border-blue-300 shadow-blue-50 shadow-md",
                  step.status === "done" && "border-green-200",
                  step.status === "pending" && "opacity-50"
                )}
              >
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{meta.label}</CardTitle>
                    <Badge variant={statusBadgeVariant(step.status)}>
                      {statusLabel(step.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                </CardHeader>

                {step.status === "done" && step.output && (
                  <CardContent className="py-3">
                    <StepOutput stepId={step.id} output={step.output} />
                  </CardContent>
                )}
              </Card>
            </div>
          </div>
        );
      })}
    </div>
  );
}
