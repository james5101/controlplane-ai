"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Cloud, ExternalLink, GitPullRequest,
  RefreshCw, BookOpen, AlertTriangle, CheckCircle,
  Clock, Info, Layers, Globe, Play, RotateCcw,
  ArrowUpDown, Activity, Lock, Eye, Users, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getService, regenerateRunbook, type Service } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section { id: string; title: string; content: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLOUD_LABELS: Record<string, string> = { aws: "AWS", gcp: "GCP", azure: "Azure" };
const CLOUD_COLORS: Record<string, string> = {
  aws: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  gcp: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  azure: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseIntoSections(md: string): Section[] {
  const sections: Section[] = [];
  let title = "", id = "";
  const buf: string[] = [];

  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      if (title) sections.push({ id, title, content: buf.join("\n").trim() });
      title = line.replace(/^## /, "").trim();
      id = slugify(title);
      buf.length = 0;
    } else if (!line.startsWith("# ")) {
      buf.push(line);
    }
  }
  if (title) sections.push({ id, title, content: buf.join("\n").trim() });
  return sections;
}

function sectionIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("what") || t.includes("overview")) return Info;
  if (t.includes("architect")) return Layers;
  if (t.includes("environment")) return Globe;
  if (t.includes("deploy") && !t.includes("roll")) return Play;
  if (t.includes("rollback")) return RotateCcw;
  if (t.includes("scale")) return ArrowUpDown;
  if (t.includes("health")) return Activity;
  if (t.includes("secret") || t.includes("config")) return Lock;
  if (t.includes("failure") || t.includes("error")) return AlertTriangle;
  if (t.includes("monitor") || t.includes("log")) return Eye;
  if (t.includes("owner")) return Users;
  return FileText;
}

// ─── Markdown component overrides ─────────────────────────────────────────────
// Styles live in globals.css (.runbook-content). These overrides handle the
// few cases that need extra HTML structure (table overflow wrapper, code block).

const mdComponents: Components = {
  table: ({ children }) => (
    <div style={{ overflowX: "auto", borderRadius: "0.5rem", border: "1px solid #e5e7eb", marginBottom: "1rem" }}>
      <table>{children}</table>
    </div>
  ),
};

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: Section }) {
  const Icon = sectionIcon(section.title);
  return (
    <div
      id={section.id}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden scroll-mt-6"
    >
      <div className="flex items-center gap-2.5 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <Icon className="h-4 w-4 text-gray-400 shrink-0" />
        <h2 className="text-sm font-semibold text-gray-800">{section.title}</h2>
      </div>
      <div className="px-5 py-4 runbook-content">
        {section.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {section.content}
          </ReactMarkdown>
        ) : (
          <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "0.875rem" }}>
            No content.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  svc, sections, onRegenerate, regenerating, regeneratePr,
}: {
  svc: Service;
  sections: Section[];
  onRegenerate: () => void;
  regenerating: boolean;
  regeneratePr: string | null;
}) {
  return (
    <aside className="w-56 shrink-0">
      <div className="sticky top-6 flex flex-col gap-3">

        {/* Service info */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Service
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Bootstrapped {timeAgo(svc.created_at)}</span>
          </div>
          {svc.runbook_generated_at && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span>Runbook {timeAgo(svc.runbook_generated_at)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 pt-1">
            <a href={svc.pr_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors">
              <GitPullRequest className="h-3.5 w-3.5" /> View PR
            </a>
            <a href={svc.repo_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> Open repo
            </a>
          </div>
        </div>

        {/* Runbook controls */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Runbook
          </p>
          {svc.runbook_generated_at && (
            svc.runbook_stale ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Stale — {svc.runbook_age_days}d old</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Up to date</span>
              </div>
            )
          )}
          <Button size="sm" variant="outline" onClick={onRegenerate}
            disabled={regenerating} className="w-full h-8 text-xs gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </Button>
          {regeneratePr && (
            <a href={regeneratePr} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-blue-600 hover:underline">
              PR opened →
            </a>
          )}
        </div>

        {/* TOC */}
        {sections.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Contents
            </p>
            <nav className="flex flex-col">
              {sections.map(({ id, title }) => (
                <a key={id} href={`#${id}`}
                  className="text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 py-1.5 px-2 rounded-md transition-colors leading-snug">
                  {title}
                </a>
              ))}
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServiceDetailPage() {
  const { id } = useParams();
  const [svc, setSvc] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratePr, setRegeneratePr] = useState<string | null>(null);

  useEffect(() => {
    getService(Number(id))
      .then(setSvc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRegenerate() {
    if (!svc) return;
    setRegenerating(true);
    setRegeneratePr(null);
    try {
      const { pr_url } = await regenerateRunbook(svc.id);
      setRegeneratePr(pr_url);
      setSvc(await getService(svc.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  if (error || !svc) return (
    <div className="p-8 text-sm text-red-500">{error ?? "Service not found"}</div>
  );

  const sections = svc.runbook_md ? parseIntoSections(svc.runbook_md) : [];

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* Back */}
        <Link href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Catalog
        </Link>

        {/* Service header */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gray-100 shrink-0">
              <Cloud className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{svc.repo_name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {svc.cloud && (
                  <Badge variant="outline" className={`text-xs ${CLOUD_COLORS[svc.cloud] ?? ""}`}>
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
            </div>
          </div>
          {svc.original_request && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-start gap-3">
              <span className="text-xs font-medium text-gray-400 shrink-0 mt-0.5 uppercase tracking-wide">
                Request
              </span>
              <p className="text-sm text-gray-600 italic">"{svc.original_request}"</p>
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex gap-4 items-start">
          {/* Section cards */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {sections.length > 0 ? (
              sections.map((s) => <SectionCard key={s.id} section={s} />)
            ) : (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl px-8 py-16 text-center">
                <BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No runbook generated yet.</p>
                <Button size="sm" variant="outline" onClick={handleRegenerate}
                  disabled={regenerating} className="mt-4 gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                  {regenerating ? "Generating…" : "Generate runbook"}
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <Sidebar
            svc={svc}
            sections={sections}
            onRegenerate={handleRegenerate}
            regenerating={regenerating}
            regeneratePr={regeneratePr}
          />
        </div>
      </div>
    </div>
  );
}
