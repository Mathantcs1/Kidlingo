"use client";
import { Suspense } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Sun, Moon, LogOut, Settings, Menu,
  LayoutDashboard, LineChart, BarChart2, BrainCircuit,
  CalendarCheck, Bell, ShieldCheck, Activity, Wallet,
  ScanLine, Zap } from "lucide-react";
import { HelpDialog } from "@/components/layout/help-dialog";
import { AccountSelector } from "@/components/accounts/account-selector";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: LineChart },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/plans", label: "Trade Plans", icon: CalendarCheck },
  { href: "/scanners", label: "Scanners", icon: ScanLine },
  { href: "/unusual-trades", label: "Unusual Trades", icon: Zap },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/ai", label: "AI Assistant", icon: BrainCircuit },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

// Pages where the account selector is shown in header (filters data)
const ACCOUNT_FILTER_PATHS = ["/dashboard", "/trades", "/reports", "/ai"];

interface HeaderProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role: string; aiProvider: string };
}

export function Header({ user }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const initials = user.name?.split(" ").map((n) => n[0]).join("").toUpperCase() ?? "U";

  const showAccountFilter = ACCOUNT_FILTER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 gap-3">
      {/* Left: Mobile hamburger + role badge */}
      <div className="flex items-center gap-2 shrink-0">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 p-0"
            style={{
              backgroundColor: "hsl(var(--sidebar-background))",
              borderColor: "hsl(var(--sidebar-border))",
            }}
          >
            <div
              className="flex items-center gap-2.5 px-4 py-[18px] border-b"
              style={{ borderColor: "hsl(var(--sidebar-border))" }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/25">
                <Activity className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-sm font-bold tracking-tight text-white/90">
                Trade<span className="text-amber-400">Pulse</span>
              </span>
            </div>
            <nav className="flex-1 py-3 space-y-0.5 px-2">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href}
                    className={cn(
                      "group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
                        : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
                    )}>
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-amber-400" : "")} />
                    {label}
                  </Link>
                );
              })}
              {user.role === "ADMIN" && (
                <>
                  <div className="mt-4 mb-1 px-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--sidebar-foreground) / 0.5)" }}>Admin</p>
                  </div>
                  <Link href="/admin"
                    className={cn(
                      "group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-150",
                      pathname.startsWith("/admin")
                        ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
                        : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
                    )}>
                    <ShieldCheck className={cn("h-4 w-4 shrink-0", pathname.startsWith("/admin") ? "text-amber-400" : "")} />
                    Admin Panel
                  </Link>
                </>
              )}
              <div className="mt-4 pt-3 space-y-0.5 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
                <HelpDialog role={user.role} />
                <Link href="/settings"
                  className={cn(
                    "group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-150",
                    pathname === "/settings"
                      ? "bg-[hsl(var(--sidebar-accent))] text-amber-300 shadow-[inset_2px_0_0_hsl(38,90%,50%)]"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
                  )}>
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </Link>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        {user.role === "ADMIN" && <Badge variant="secondary" className="text-xs hidden md:inline-flex">ADMIN</Badge>}
        {user.role === "VIEWER" && <Badge variant="outline" className="text-xs hidden md:inline-flex">READ ONLY</Badge>}
        {user.role === "ADMIN" && <Badge variant="secondary" className="text-xs md:hidden">ADMIN</Badge>}
      </div>

      {/* Centre: Account selector — shown on data pages */}
      {showAccountFilter && (
        <div className="flex-1 flex justify-start">
          <Suspense fallback={<div className="h-8 w-36 rounded-md bg-muted animate-pulse" />}>
            <AccountSelector />
          </Suspense>
        </div>
      )}

      {/* Right: theme + avatar */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <Button variant="ghost" size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
