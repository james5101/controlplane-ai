"use client";

import { GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1f36]">
      <Card className="w-full max-w-sm bg-[#252d4a] border-[#2d3561] text-white shadow-2xl">
        <CardHeader className="items-center text-center space-y-3 pb-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600">
            <GitBranch className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl text-white">ControlPlane AI</CardTitle>
            <CardDescription className="text-[#a0aec0] mt-1">
              Bootstrap production-ready infrastructure in minutes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-6 px-6">
          <Button
            className="w-full bg-white text-gray-900 hover:bg-gray-100 font-semibold"
            asChild
          >
            <a href={`${API_URL}/auth/github`}>
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Sign in with GitHub
            </a>
          </Button>
          <p className="mt-4 text-center text-xs text-[#a0aec0]">
            By signing in, you authorize ControlPlane AI to access your GitHub account and organizations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
