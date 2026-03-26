const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  orgId: string,
  payload: AnalyzeReposRequest
): Promise<AnalyzeReposResponse> {
  const res = await fetch(`${API_URL}/orgs/${orgId}/analyze-repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail ?? "Analyze failed");
  }
  return res.json();
}

export async function saveOrgConfig(orgId: string, configYaml: string): Promise<void> {
  const res = await fetch(`${API_URL}/orgs/${orgId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config_yaml: configYaml }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(error.detail ?? "Save failed");
  }
}

export interface BootstrapRequest {
  org_id: string;
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
  orgId: string,
  payload: AnalyzeReposRequest,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/orgs/${orgId}/analyze-repos/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
