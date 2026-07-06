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
        "relative flex-col border-r transition-all duration-300 hidden md:flex shrink-0",
        "bg-[hsl(var(--sidebar-background))] border-[hsl(var(--sidebar-border))]",
        collapsed ? "w-[60px]" : "w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b px-4 py-[18px]",
          "border-[hsl(var(--sidebar-border))]",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/25">
          <Activity className="h-4 w-4 text-amber-400" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight text-white/90">
            Trade<span className="text-amber-400">Pulse</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-amber-400" : "group-hover:text-white/80"
                )}
              />
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 leading-none tracking-wide">
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
            <div className={cn("mt-4 mb-1 px-2.5", collapsed && "px-0")}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--sidebar-foreground)/0.5)]">
                  Admin
                </p>
              )}
            </div>
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-amber-400" : "group-hover:text-white/80"
                    )}
                  />
                  {!collapsed && label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom: Help + Settings */}
      <div
        className={cn(
          "border-t py-3 px-2 space-y-0.5",
          "border-[hsl(var(--sidebar-border))]"
        )}
      >
        <HelpDialog role={role} collapsed={collapsed} />
        <Link
          href="/settings"
          className={cn(
            "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-150",
            pathname === "/settings"
              ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
              : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4 shrink-0 group-hover:text-white/80" />
          {!collapsed && "Settings"}
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full",
          "border bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]",
          "border-[hsl(var(--sidebar-border))] hover:text-white transition-colors shadow-sm"
        )}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
}
