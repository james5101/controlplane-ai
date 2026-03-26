import Link from "next/link";
import {
  LayoutDashboard,
  PlusCircle,
  Settings,
  BookOpen,
  GitBranch,
  Boxes,
  Search,
} from "lucide-react";

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
    </aside>
  );
}
