"use client";
import { useEffect, useState, useCallback } from "react";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Wallet, MoreHorizontal, Pencil, Trash2, TrendingUp, TrendingDown, Star } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";

interface Account {
  id: string;
  name: string;
  broker: string | null;
  accountType: string | null;
  currency: string;
  color: string;
  isDefault: boolean;
  tradeCount: number;
  totalPnl: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/accounts");
    const data = await res.json();
    if (Array.isArray(data)) setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Trades will be unlinked but not deleted.`)) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Account deleted" });
      load();
    } else {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground text-sm">Manage your trading accounts</p>
        </div>
        <AccountDialog onSaved={load} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-lg border bg-muted animate-pulse" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Wallet className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium">No accounts yet</p>
          <p className="text-sm text-muted-foreground">Create your first trading account to organise your trades.</p>
          <AccountDialog onSaved={load} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className="relative overflow-hidden">
              {/* Color strip */}
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: account.color }} />

              <CardHeader className="pt-5 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: account.color }} />
                    <h3 className="font-semibold truncate">{account.name}</h3>
                    {account.isDefault && (
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <AccountDialog
                        account={account}
                        onSaved={load}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Pencil className="mr-2 h-4 w-4" />Edit
                          </DropdownMenuItem>
                        }
                      />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(account.id, account.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {account.broker && <Badge variant="outline" className="text-xs">{account.broker}</Badge>}
                  {account.accountType && <Badge variant="secondary" className="text-xs">{account.accountType}</Badge>}
                  <Badge variant="outline" className="text-xs">{account.currency}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={cn("font-semibold text-sm mt-0.5", account.totalPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {account.totalPnl >= 0 ? <TrendingUp className="inline h-3.5 w-3.5 mr-1" /> : <TrendingDown className="inline h-3.5 w-3.5 mr-1" />}
                      {formatCurrency(account.totalPnl)}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="font-semibold text-sm mt-0.5">{account.tradeCount}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                  <Link href={`/trades?account=${account.id}`}>View Trades</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
