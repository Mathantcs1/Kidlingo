"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { MoreHorizontal, Eye, Pencil, Trash2, BrainCircuit, ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";

interface TradeRow {
  id: string;
  instrument: string;
  direction: string;
  status: string;
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  rMultiple: number | null;
  strategyTag: string | null;
  tradingAccount?: { id: string; name: string; color: string } | null;
}

interface TradeTableProps {
  trades: TradeRow[];
  total: number;
  page: number;
  pageSize: number;
  role: string;
  accounts?: { id: string; name: string; color: string }[];
}

export function TradeTable({ trades, total, page, pageSize, role, accounts = [] }: TradeTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete(id: string) {
    if (!confirm("Delete this trade? This cannot be undone.")) return;
    const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Trade deleted" });
      startTransition(() => router.refresh());
    } else {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {["Date", "Instrument", "Account", "Direction", "Entry", "Exit", "Qty", "P&L", "R", "Strategy", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground text-sm">No trades found. Add your first trade!</td></tr>
            )}
            {trades.map((trade) => (
              <tr key={trade.id} className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => router.push(`/trades/${trade.id}`)}>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs">{formatDate(trade.entryDate)}</td>
                <td className="px-3 py-2.5 font-medium">{trade.instrument}</td>
                <td className="px-3 py-2.5">
                  {trade.tradingAccount ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: trade.tradingAccount.color }} />
                      <span className="text-xs text-muted-foreground truncate max-w-[80px]">{trade.tradingAccount.name}</span>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={cn("text-xs", trade.direction === "LONG" ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30")}>
                    {trade.direction}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs">${trade.entryPrice.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-xs">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2.5 text-xs">{trade.quantity}</td>
                <td className={cn("px-3 py-2.5 font-semibold text-xs", trade.pnl === null ? "text-muted-foreground" : trade.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {trade.pnl !== null ? formatCurrency(trade.pnl) : "—"}
                </td>
                <td className={cn("px-3 py-2.5 text-xs", trade.rMultiple === null ? "text-muted-foreground" : trade.rMultiple >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {trade.rMultiple !== null ? `${trade.rMultiple.toFixed(2)}R` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{trade.strategyTag ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={trade.status === "CLOSED" ? "secondary" : "outline"} className="text-xs">
                    {trade.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/trades/${trade.id}`}><Eye className="mr-2 h-4 w-4" />View</Link>
                      </DropdownMenuItem>
                      {role !== "VIEWER" && (
                        <DropdownMenuItem asChild>
                          <Link href={`/trades/${trade.id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => router.push(`/trades/${trade.id}?analyze=1`)} className="text-blue-500">
                        <BrainCircuit className="mr-2 h-4 w-4" />AI Analysis
                      </DropdownMenuItem>
                      {role !== "VIEWER" && (
                        <DropdownMenuItem onClick={() => handleDelete(trade.id)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} asChild>
              <Link href={`?page=${page - 1}`}><ChevronLeft className="h-3 w-3" /></Link>
            </Button>
            <span className="text-xs">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} asChild>
              <Link href={`?page=${page + 1}`}><ChevronRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
