"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Wallet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Account {
  id: string;
  name: string;
  broker: string | null;
  color: string;
  isDefault: boolean;
  totalPnl: number;
  tradeCount: number;
}

export function AccountSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const currentId = searchParams.get("account") ?? "all";

  const load = useCallback(() => {
    fetch("/api/accounts").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setAccounts(data);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") params.delete("account");
    else params.set("account", id);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const current = currentId === "all" ? null : accounts.find((a) => a.id === currentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: current?.color ?? "hsl(var(--muted-foreground))" }}
          />
          <Wallet className="h-3.5 w-3.5" />
          {current?.name ?? "All Accounts"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={() => select("all")} className={currentId === "all" ? "bg-accent" : ""}>
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground mr-2 shrink-0" />
          All Accounts
        </DropdownMenuItem>
        {accounts.length > 0 && <DropdownMenuSeparator />}
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => select(a.id)} className={currentId === a.id ? "bg-accent" : ""}>
            <div className="w-2.5 h-2.5 rounded-full mr-2 shrink-0" style={{ background: a.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.name}</p>
              {a.broker && <p className="text-xs text-muted-foreground">{a.broker}</p>}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
