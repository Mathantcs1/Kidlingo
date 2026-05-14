"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { AccountSelector } from "@/components/accounts/account-selector";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account") ?? "";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState("instrument");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ groupBy });
    if (accountId) params.set("account", accountId);
    fetch(`/api/reports?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [groupBy, accountId]);

  async function handleExport() {
    const res = await fetch("/api/reports/export");
    if (res.status === 403) {
      toast({ title: "Export requires BASIC or PRO plan", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const grouped = (data?.grouped ?? {}) as Record<string, { totalPnl: number; trades: number; winRate: number; wins: number; losses: number }>;
  const streak = data?.streak as { current: number; longestWin: number; longestLoss: number } | undefined;
  const riskMetrics = data?.riskMetrics as { sharpeRatio: number; profitFactor: number } | undefined;

  const chartData = Object.entries(grouped)
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, 10)
    .map(([name, stats]) => ({ name: name ?? "Unknown", ...stats }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Detailed performance analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <AccountSelector />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="instrument" onValueChange={(v) => setGroupBy(v === "instrument" ? "instrument" : v === "strategy" ? "strategy" : v === "dayOfWeek" ? "dayOfWeek" : "hour")}>
        <TabsList>
          <TabsTrigger value="instrument">By Instrument</TabsTrigger>
          <TabsTrigger value="strategy">By Strategy</TabsTrigger>
          <TabsTrigger value="dayOfWeek">By Day</TabsTrigger>
          <TabsTrigger value="hour">By Hour</TabsTrigger>
          <TabsTrigger value="risk">Risk Metrics</TabsTrigger>
        </TabsList>

        {["instrument", "strategy", "dayOfWeek", "hour"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-sm">P&L by {tab}</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                          formatter={(v: number, n: string) => [n === "totalPnl" ? formatCurrency(v) : `${v.toFixed(1)}%`, n === "totalPnl" ? "P&L" : "Win Rate"]} />
                        <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                          {chartData.map((entry, i) => <Cell key={i} fill={entry.totalPnl >= 0 ? "#10b981" : "#ef4444"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["Name", "Trades", "Wins", "Losses", "Win Rate", "Total P&L"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => (
                        <tr key={row.name} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2.5 font-medium text-xs">{row.name}</td>
                          <td className="px-3 py-2.5 text-xs">{row.trades}</td>
                          <td className="px-3 py-2.5 text-xs text-emerald-500">{row.wins}</td>
                          <td className="px-3 py-2.5 text-xs text-red-500">{row.losses}</td>
                          <td className="px-3 py-2.5 text-xs">{row.winRate.toFixed(1)}%</td>
                          <td className={cn("px-3 py-2.5 text-xs font-semibold", row.totalPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {formatCurrency(row.totalPnl)}
                          </td>
                        </tr>
                      ))}
                      {chartData.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-sm">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        ))}

        <TabsContent value="risk" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Sharpe Ratio", value: riskMetrics?.sharpeRatio?.toFixed(2) ?? "—", note: "> 1.0 is good" },
              { label: "Profit Factor", value: riskMetrics?.profitFactor?.toFixed(2) ?? "—", note: "> 1.5 is good" },
              { label: "Current Streak", value: streak ? (streak.current > 0 ? `+${streak.current}W` : streak.current < 0 ? `${streak.current}L` : "0") : "—", note: "Win/Loss streak" },
              { label: "Longest Win", value: streak ? `${streak.longestWin}W` : "—", note: "Consecutive wins" },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-2xl font-bold mt-1">{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
