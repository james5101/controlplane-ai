"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgConfig {
  namingConvention: string;
  awsRegion: string;
  terraformVersion: string;
  costCenterTag: string;
  moduleSource: string;
}

const STEPS = [
  {
    id: "naming",
    title: "Naming Convention",
    description: "How should resources and repos be named?",
  },
  {
    id: "cloud",
    title: "Cloud Defaults",
    description: "Default region and provider settings",
  },
  {
    id: "tags",
    title: "Required Tags",
    description: "Tags applied to all generated infrastructure",
  },
  {
    id: "review",
    title: "Review & Generate",
    description: "Review your config before we commit it",
  },
];

export default function OrgSetupPage() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<OrgConfig>({
    namingConvention: "{service}-{env}",
    awsRegion: "us-east-1",
    terraformVersion: "1.9.0",
    costCenterTag: "engineering",
    moduleSource: "registry.terraform.io",
  });
  const [done, setDone] = useState(false);

  function update(key: keyof OrgConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  const yaml = `naming_convention: "${config.namingConvention}"
aws_region: ${config.awsRegion}
terraform_version: ${config.terraformVersion}
required_tags:
  ManagedBy: controlplane-ai
  CostCenter: ${config.costCenterTag}
module_source: ${config.moduleSource}`;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Org Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure your org's golden path conventions. This generates a{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">.controlplane.yaml</code>{" "}
          committed to your config repo.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center rounded-full text-xs font-medium w-7 h-7 ${
                i < step
                  ? "bg-green-100 text-green-700"
                  : i === step
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].title}</CardTitle>
          <CardDescription>{STEPS[step].description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Naming convention
                </label>
                <Input
                  value={config.namingConvention}
                  onChange={(e) => update("namingConvention", e.target.value)}
                  placeholder="{service}-{env}"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Use <code className="bg-gray-100 px-1 rounded">{"{service}"}</code> and{" "}
                  <code className="bg-gray-100 px-1 rounded">{"{env}"}</code> as placeholders.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default AWS region
                </label>
                <Input
                  value={config.awsRegion}
                  onChange={(e) => update("awsRegion", e.target.value)}
                  placeholder="us-east-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Terraform version
                </label>
                <Input
                  value={config.terraformVersion}
                  onChange={(e) => update("terraformVersion", e.target.value)}
                  placeholder="1.9.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Module source registry
                </label>
                <Input
                  value={config.moduleSource}
                  onChange={(e) => update("moduleSource", e.target.value)}
                  placeholder="registry.terraform.io"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost center tag value
                </label>
                <Input
                  value={config.costCenterTag}
                  onChange={(e) => update("costCenterTag", e.target.value)}
                  placeholder="engineering"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Applied as <code className="bg-gray-100 px-1 rounded">CostCenter</code> tag on
                  all resources. <code className="bg-gray-100 px-1 rounded">ManagedBy: controlplane-ai</code> is
                  always added.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">
                This file will be committed to your org's config repo as{" "}
                <code className="bg-gray-100 px-1 rounded">.controlplane.yaml</code>
              </p>
              <pre className="text-xs bg-gray-900 text-green-400 rounded-md p-4 overflow-x-auto">
                {yaml}
              </pre>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setDone(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Generate Config
            </Button>
          )}
        </CardFooter>
      </Card>

      {done && (
        <Card className="mt-4 border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm font-medium">
                Config generated. TODO: commit to GitHub config repo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
