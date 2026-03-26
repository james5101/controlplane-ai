const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Auth types & functions ────────────────────────────────────────────────────

export interface AuthUser {
  user_id: number;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
  active_workspace: string | null;
}

export interface WorkspacesResponse {
  personal: { login: string; avatar_url: string; type: string };
  orgs: Array<{ login: string; avatar_url: string; type: string }>;
}

export async function getMe(): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWorkspaces(): Promise<WorkspacesResponse> {
  const res = await fetch(`${API_URL}/auth/workspaces`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function setWorkspace(workspace: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workspace }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Org analysis ─────────────────────────────────────────────────────────────

export interface AnalyzeReposRequest {
  repo_urls: string[];
}

export interface AnalyzeReposResponse {
  inferred_config: Record<string, unknown>;
  sources: Record<string, string>;
  notes: string[];
  repos_scanned: string[];
}

export async function analyzeRepos(
  payload: AnalyzeReposRequest
): Promise<AnalyzeReposResponse> {
  const res = await fetch(`${API_URL}/orgs/analyze-repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail ?? "Analyze failed");
  }
  return res.json();
}

export async function saveOrgConfig(configYaml: string): Promise<void> {
  const res = await fetch(`${API_URL}/orgs/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ config_yaml: configYaml }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(error.detail ?? "Save failed");
  }
}

// ─── Service catalog ──────────────────────────────────────────────────────────

export interface Service {
  id: number;
  repo_name: string;
  repo_url: string;
  pr_url: string;
  cloud: string | null;
  service_type: string | null;
  environments: string[];
  original_request: string | null;
  runbook_md: string | null;
  runbook_generated_at: string | null;
  runbook_age_days: number | null;
  runbook_stale: boolean | null;
  commits_since_runbook?: number | null;
  created_at: string;
}

export async function getServices(): Promise<Service[]> {
  const res = await fetch(`${API_URL}/services/`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getService(id: number): Promise<Service> {
  const res = await fetch(`${API_URL}/services/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function regenerateRunbook(id: number): Promise<{ pr_url: string }> {
  const res = await fetch(`${API_URL}/services/${id}/runbook/regenerate`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export interface BootstrapRequest {
  request: string;
}

export interface BootstrapStep {
  step: string;
  output: Record<string, unknown>;
}

export interface BootstrapResponse {
  repo_url: string;
  pr_url: string;
  steps: BootstrapStep[];
}

export async function bootstrapService(
  payload: BootstrapRequest
): Promise<BootstrapResponse> {
  const res = await fetch(`${API_URL}/services/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Bootstrap failed");
  }

  return res.json();
}

export async function streamBootstrap(
  payload: BootstrapRequest,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/services/bootstrap/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
}

export async function streamAnalyzeRepos(
  payload: AnalyzeReposRequest,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/orgs/analyze-repos/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
}
