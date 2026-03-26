"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  PlusCircle,
  Settings,
  BookOpen,
  GitBranch,
  Boxes,
  Search,
  LogOut,
  ArrowLeftRight,
} from "lucide-react";
import { getMe, logout, AuthUser } from "@/lib/api";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "New Service", icon: PlusCircle },
  { href: "/catalog", label: "Catalog", icon: Boxes },
  { href: "/templates", label: "Templates", icon: BookOpen },
];

const bottomNav = [
  { href: "/orgs/analyze", label: "Analyze Repos", icon: Search },
  { href: "/orgs/config", label: "Org Config", icon: Settings },
];

export function Sidebar() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setUserLoading(false));
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore errors — cookie may already be gone
    }
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-[#1a1f36] text-white flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-[#2d3561]">
        <GitBranch className="h-5 w-5 text-blue-400" />
        <span className="font-semibold text-sm tracking-wide">ControlPlane AI</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#a0aec0] hover:bg-[#252d4a] hover:text-white transition-colors"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-4 border-t border-[#2d3561] space-y-1">
        {bottomNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#a0aec0] hover:bg-[#252d4a] hover:text-white transition-colors"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* User section */}
      <div className="px-3 py-4 border-t border-[#2d3561]">
        {userLoading ? (
          <div className="space-y-2 px-1">
            <div className="h-3 w-24 bg-[#252d4a] rounded animate-pulse" />
            <div className="h-3 w-16 bg-[#252d4a] rounded animate-pulse" />
          </div>
        ) : user ? (
          <div className="space-y-2">
            {/* Avatar + login + workspace */}
            <div className="flex items-center gap-2 px-1">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.github_login}
                  className="h-7 w-7 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">
                    {user.github_login[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs text-white font-medium truncate">{user.github_login}</p>
                {user.active_workspace && (
                  <p className="text-xs text-[#a0aec0] truncate">{user.active_workspace}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1">
              <Link
                href="/auth/workspace"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#a0aec0] hover:bg-[#252d4a] hover:text-white transition-colors flex-1"
              >
                <ArrowLeftRight className="h-3 w-3" />
                Switch
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#a0aec0] hover:bg-[#252d4a] hover:text-white transition-colors flex-1"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
