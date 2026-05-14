"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, LineChart, BookOpen, BarChart2,
  BrainCircuit, CalendarCheck, Bell, Settings,
  ShieldCheck, Activity, ChevronLeft, ChevronRight, Wallet,
  ScanLine, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { HelpDialog } from "@/components/layout/help-dialog";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: LineChart },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/plans", label: "Trade Plans", icon: CalendarCheck },
  { href: "/scanners", label: "Scanners", icon: ScanLine, badge: "NEW" },
  { href: "/unusual-trades", label: "Unusual Trades", icon: Zap, badge: "NEW" },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/ai", label: "AI Assistant", icon: BrainCircuit },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

const adminItems = [
  { href: "/admin", label: "Admin Panel", icon: ShieldCheck },
];

interface SidebarProps {
  role: string;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex-col bg-slate-900 border-r border-slate-700 transition-all duration-300 hidden md:flex shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-2 px-4 py-5 border-b border-slate-700", collapsed && "justify-center px-2")}>
        <div className="p-1.5 rounded-md shrink-0 bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/25">
          <Activity className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400 text-sm truncate tracking-tight">
            TradePulse
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold bg-blue-500 text-white leading-none">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}

        {role === "ADMIN" && (
          <>
            <div className={cn("mt-4 mb-1 px-3", collapsed && "px-0")}>
              {!collapsed && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</p>
              )}
            </div>
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom: Help + Settings */}
      <div className="border-t border-slate-700 py-3 px-2 space-y-1">
        <HelpDialog role={role} collapsed={collapsed} />
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-400 hover:text-white shadow-sm"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
