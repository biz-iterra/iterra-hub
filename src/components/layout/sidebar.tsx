"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Handshake,
  Users,
  Building2,
  Briefcase,
  FileText,
  UserCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CrmUserRole } from "@/types/enums";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  roles?: CrmUserRole[];
};

const navItems: NavItem[] = [
  { label: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { label: "ディール", href: "/deals", icon: Handshake },
  { label: "プロジェクト", href: "/projects", icon: FolderKanban },
  { label: "コンタクト", href: "/contacts", icon: Users },
  { label: "カンパニー", href: "/companies", icon: Building2 },
  { label: "アカウント", href: "/accounts", icon: Briefcase },
  { label: "契約", href: "/contracts", icon: FileText, roles: ["manager", "admin"] },
  { label: "タレント", href: "/talents", icon: UserCircle },
];

const adminItems: NavItem[] = [
  { label: "管理", href: "/admin", icon: Settings, roles: ["admin"] },
];

export function Sidebar({ userRole = "admin" }: { userRole?: CrmUserRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const canAccess = (item: NavItem) => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col h-screen shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
      style={{ backgroundColor: "var(--color-terra)" }}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4">
        <span className="text-white font-bold text-lg tracking-tight">
          {collapsed ? "I" : "ITERRA CRM"}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
        {navItems.filter(canAccess).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 mx-2 px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0"
              )}
              style={{
                color: active ? "#fff" : "rgba(255,255,255,0.7)",
                backgroundColor: active ? "var(--color-terra-dark)" : "transparent",
                borderRadius: "var(--radius-md)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "var(--color-terra-dark)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "transparent";
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Separator */}
        {adminItems.some(canAccess) && (
          <div
            className="mx-4 my-3"
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.15)",
            }}
          />
        )}

        {adminItems.filter(canAccess).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 mx-2 px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0"
              )}
              style={{
                color: active ? "#fff" : "rgba(255,255,255,0.7)",
                backgroundColor: active ? "var(--color-terra-dark)" : "transparent",
                borderRadius: "var(--radius-md)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "var(--color-terra-dark)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "transparent";
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 mx-2 mb-3 cursor-pointer transition-colors"
        style={{
          color: "rgba(255,255,255,0.5)",
          borderRadius: "var(--radius-md)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-terra-dark)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  );
}
