"use client";

import { GitBranch, Zap, Shield, GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600 opacity-[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500 opacity-[0.07] blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6">
        {/* Logo mark */}
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-6">
          <GitBranch className="h-7 w-7 text-white" />
        </div>

        {/* Wordmark */}
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          ControlPlane <span className="text-blue-400">AI</span>
        </h1>
        <p className="text-[#8b949e] text-center text-sm leading-relaxed mb-10 max-w-xs">
          Production-ready infrastructure from a single sentence — following your org's own conventions.
        </p>

        {/* Feature pills */}
        <div className="flex flex-col gap-3 w-full mb-10">
          {[
            { icon: Zap, label: "Terraform + CI/CD scaffold in ~60 seconds" },
            { icon: GitPullRequest, label: "Opens a GitHub PR ready for review" },
            { icon: Shield, label: "Follows your org's naming, tags, and modules" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3"
            >
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-500/10 shrink-0">
                <Icon className="h-4 w-4 text-blue-400" />
              </div>
              <span className="text-sm text-[#c9d1d9]">{label}</span>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div className="w-full bg-white/[0.04] border border-white/[0.09] rounded-2xl p-6 backdrop-blur-sm">
          <Button
            className="w-full bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] hover:border-[#8b949e] font-semibold h-11 transition-all duration-150"
            asChild
          >
            <a href={`${API_URL}/auth/github`}>
              <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </a>
          </Button>
          <p className="mt-4 text-center text-xs text-[#6e7681] leading-relaxed">
            By continuing, you authorize ControlPlane AI to access your GitHub account and organizations.
          </p>
        </div>
      </div>
    </div>
  );
}
