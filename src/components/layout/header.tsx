"use client";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Sun, Moon, LogOut, Settings, Menu,
  LayoutDashboard, LineChart, BarChart2, BrainCircuit,
  CalendarCheck, Bell, ShieldCheck, TrendingUp } from "lucide-react";
import { HelpDialog } from "@/components/layout/help-dialog";
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
  { href: "/plans", label: "Trade Plans", icon: CalendarCheck },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/ai", label: "AI Assistant", icon: BrainCircuit },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

interface HeaderProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role: string; aiProvider: string };
}

export function Header({ user }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const initials = user.name?.split(" ").map((n) => n[0]).join("").toUpperCase() ?? "U";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      {/* Mobile hamburger + logo */}
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-slate-700">
            <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
              <div className="p-1.5 bg-blue-600 rounded-md">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white text-sm">TradingJournal</span>
            </div>
            <nav className="flex-1 py-4 space-y-1 px-2">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
              {user.role === "ADMIN" && (
                <>
                  <div className="mt-4 mb-1 px-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</p>
                  </div>
                  <Link href="/admin"
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      pathname.startsWith("/admin") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Admin Panel
                  </Link>
                </>
              )}
              <div className="mt-4 border-t border-slate-700 pt-3 space-y-1">
                <HelpDialog role={user.role} />
                <Link href="/settings"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    pathname === "/settings" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}>
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </Link>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        {/* Desktop: role badge */}
        <div className="hidden md:flex items-center gap-2">
          {user.role === "ADMIN" && <Badge variant="secondary" className="text-xs">ADMIN</Badge>}
          {user.role === "VIEWER" && <Badge variant="outline" className="text-xs">READ ONLY</Badge>}
        </div>

        {/* Mobile: role badge next to hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user.role === "ADMIN" && <Badge variant="secondary" className="text-xs">ADMIN</Badge>}
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
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
