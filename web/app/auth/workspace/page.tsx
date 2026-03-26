"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getWorkspaces, setWorkspace, AuthUser, WorkspacesResponse } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type WorkspaceEntry = {
  login: string;
  avatar_url: string;
  type: "personal" | "org";
};

export default function WorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [me, ws] = await Promise.all([getMe(), getWorkspaces()]);
        // If user already has an active workspace, skip the picker
        if (me.active_workspace) {
          router.replace("/");
          return;
        }
        setUser(me);
        setWorkspaces(ws);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workspaces");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleSelect(login: string) {
    setSelecting(login);
    try {
      await setWorkspace(login);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set workspace");
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1f36]">
        <div className="w-full max-w-2xl px-4">
          <div className="mb-8 text-center">
            <div className="h-8 w-48 bg-[#252d4a] rounded animate-pulse mx-auto mb-2" />
            <div className="h-4 w-64 bg-[#252d4a] rounded animate-pulse mx-auto" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-[#252d4a] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1f36]">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <a href="/login" className="text-blue-400 text-sm underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  const allWorkspaces: WorkspaceEntry[] = workspaces
    ? [
        { ...workspaces.personal, type: "personal" },
        ...workspaces.orgs.map((o) => ({ ...o, type: "org" as const })),
      ]
    : [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1f36]">
      <div className="w-full max-w-2xl px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Choose a workspace</h1>
          <p className="text-[#a0aec0] text-sm mt-1">
            You can switch workspaces any time from the sidebar
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allWorkspaces.map((ws) => (
            <button
              key={ws.login}
              onClick={() => handleSelect(ws.login)}
              disabled={!!selecting}
              className="text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg disabled:opacity-60"
            >
              <Card className="bg-[#252d4a] border-[#2d3561] hover:border-blue-500 hover:bg-[#2d3561] transition-all cursor-pointer">
                <CardContent className="flex items-center gap-4 py-5 px-5">
                  {ws.avatar_url ? (
                    <img
                      src={ws.avatar_url}
                      alt={ws.login}
                      className="h-10 w-10 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-semibold text-sm">
                        {ws.login[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {selecting === ws.login ? "Selecting…" : ws.login}
                    </p>
                    <Badge
                      variant="neutral"
                      className="mt-1 text-xs bg-[#1a1f36] text-[#a0aec0] border-[#2d3561]"
                    >
                      {ws.type === "personal" ? "Personal" : "Organization"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
