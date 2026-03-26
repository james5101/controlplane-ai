"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Plus,
  Cloud,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServices, type Service } from "@/lib/api";

const CLOUD_LABELS: Record<string, string> = { aws: "AWS", gcp: "GCP", azure: "Azure" };
const CLOUD_COLORS: Record<string, string> = {
  aws: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  gcp: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  azure: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RunbookBadge({ svc }: { svc: Service }) {
  if (!svc.runbook_md) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <BookOpen className="h-3 w-3" />
        No runbook
      </span>
    );
  }
  if (svc.runbook_stale) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <AlertTriangle className="h-3 w-3" />
        Runbook stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600">
      <BookOpen className="h-3 w-3" />
      Runbook
    </span>
  );
}

export default function CatalogPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServices()
      .then(setServices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">
            All services bootstrapped by ControlPlane AI.
          </p>
        </div>
        <Button asChild>
          <Link href="/new">
            <Plus className="h-4 w-4 mr-2" />
            New service
          </Link>
        </Button>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 text-center py-16">Loading…</div>
      )}

      {error && (
        <div className="text-sm text-red-500 text-center py-16">{error}</div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-gray-200 rounded-xl text-center">
          <GitBranch className="h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No services yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Bootstrap your first service to see it here.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/new">Bootstrap a service</Link>
          </Button>
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <div className="flex flex-col gap-3">
          {services.map((svc) => (
            <Link
              key={svc.id}
              href={`/catalog/${svc.id}`}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              {/* Icon */}
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gray-100 shrink-0">
                <Cloud className="h-4 w-4 text-gray-500" />
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm truncate">
                    {svc.repo_name}
                  </span>
                  {svc.cloud && (
                    <Badge
                      variant="outline"
                      className={`text-xs font-medium ${CLOUD_COLORS[svc.cloud] ?? "bg-gray-100 text-gray-500"}`}
                    >
                      {CLOUD_LABELS[svc.cloud] ?? svc.cloud}
                    </Badge>
                  )}
                  {svc.service_type && (
                    <Badge variant="outline" className="text-xs text-gray-500">
                      {svc.service_type}
                    </Badge>
                  )}
                  {svc.environments?.map((env) => (
                    <Badge key={env} variant="secondary" className="text-xs">{env}</Badge>
                  ))}
                </div>
                {svc.original_request && (
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-lg">
                    "{svc.original_request}"
                  </p>
                )}
              </div>

              {/* Right side */}
              <div className="flex items-center gap-4 shrink-0">
                <RunbookBadge svc={svc} />
                <span className="text-xs text-gray-400">{timeAgo(svc.created_at)}</span>
                <a
                  href={svc.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  PR
                </a>
                <a
                  href={svc.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Repo
                </a>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
