"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Info, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnusualTrade {
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  dte: number;
  volume: number;
  oi: number;
  volOi: number;
  iv: number;
  ivPercent: string;
  ivRank: number;
  premium: string;
  tradeType: "Block" | "Sweep";
  signal: "Bullish" | "Bearish" | "Neutral";
}

interface Summary {
  totalSignals: number;
  bullishFlow: number;
  bearishFlow: number;
  avgIvRank: number;
  ivDistribution: { range: string; count: number }[];
}

interface UnusualTradesResponse {
  summary: Summary;
  trades: UnusualTrade[];
}

function IvDistributionChart({ data }: { data: { range: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const barColors = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#dc2626"];
  const w = 40;
  const gap = 8;
  const barH = 60;
  const totalW = data.length * w + (data.length - 1) * gap;

  return (
    <svg width={totalW} height={barH + 32} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.count / max) * barH);
        const x = i * (w + gap);
        const color = barColors[i] ?? "#64748b";
        return (
          <g key={d.range}>
            {/* count label above bar */}
            <text x={x + w / 2} y={barH - h - 4} textAnchor="middle" fontSize={10} fill={color} fontWeight="600">
              {d.count}
            </text>
            {/* bar */}
            <rect x={x} y={barH - h} width={w} height={h} rx={3} fill={color} fillOpacity={0.8} />
            {/* range label below */}
            <text x={x + w / 2} y={barH + 14} textAnchor="middle" fontSize={8} fill="#64748b">
              {d.range}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function IvRankBar({ rank }: { rank: number }) {
  const color = rank >= 90 ? "#ef4444" : rank >= 75 ? "#f97316" : rank >= 50 ? "#eab308" : "#22c55e";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${rank}%`, background: color }} />
      </div>
      <span className="font-bold tabular-nums text-xs" style={{ color }}>{rank}</span>
    </div>
  );
}

export default function UnusualTradesPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [tradeTypeFilter, setTradeTypeFilter] = useState("all");
  const [ivRankFilter, setIvRankFilter] = useState("any");
  const [data, setData] = useState<UnusualTradesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      type: typeFilter,
      sentiment: sentimentFilter,
      tradeType: tradeTypeFilter,
      ivRank: ivRankFilter,
    });
    try {
      const res = await fetch(`/api/unusual-trades?${params}`);
      setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sentimentFilter, tradeTypeFilter, ivRankFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleExport() {
    if (!data?.trades) return;
    const headers = ["Symbol", "Type", "Strike", "Expiry", "DTE", "Volume", "OI", "Vol/OI", "IV%", "IV Rank", "Premium", "Trade Type", "Signal"];
    const rows = data.trades.map((t) => [
      t.symbol, t.type, t.strike, t.expiry, t.dte,
      t.volume, t.oi, t.volOi, t.ivPercent, t.ivRank,
      t.premium, t.tradeType, t.signal,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `unusual-trades-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  const summary = data?.summary;
  const trades = data?.trades ?? [];
  const aboveNinety = trades.filter((t) => t.ivRank >= 90).length;

  const selectCls = "h-9 rounded-md border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Unusual Trades</h1>
          <p className="text-muted-foreground text-sm">High IV &amp; Open Interest anomalies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Showing IV/OI anomalies with simulated data. Connect{" "}
          <strong>Unusual Whales API</strong> for live unusual options activity and dark pool prints.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Signals</p>
          <p className="text-3xl font-bold mt-1">{summary?.totalSignals ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Last 60 min</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bullish Flow</p>
          <p className="text-3xl font-bold mt-1 text-emerald-400">{summary?.bullishFlow ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary ? `${Math.round((summary.bullishFlow / summary.totalSignals) * 100)}% of signals` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bearish Flow</p>
          <p className="text-3xl font-bold mt-1 text-red-400">{summary?.bearishFlow ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary ? `${Math.round((summary.bearishFlow / summary.totalSignals) * 100)}% of signals` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg IV Rank</p>
          <p className="text-3xl font-bold mt-1">{summary?.avgIvRank ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{aboveNinety} signals above 90</p>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">IV Distribution</p>
          {summary?.ivDistribution && <IvDistributionChart data={summary.ivDistribution} />}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="all">Calls &amp; Puts</option>
            <option value="CALL">Calls Only</option>
            <option value="PUT">Puts Only</option>
          </select>
          <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value)} className={selectCls}>
            <option value="all">All Sentiment</option>
            <option value="Bullish">Bullish</option>
            <option value="Bearish">Bearish</option>
          </select>
          <select value={tradeTypeFilter} onChange={(e) => setTradeTypeFilter(e.target.value)} className={selectCls}>
            <option value="all">Sweeps &amp; Blocks</option>
            <option value="Sweep">Sweeps Only</option>
            <option value="Block">Blocks Only</option>
          </select>
          <select value={ivRankFilter} onChange={(e) => setIvRankFilter(e.target.value)} className={selectCls}>
            <option value="any">IV Rank: Any</option>
            <option value="50">IV Rank ≥ 50</option>
            <option value="75">IV Rank ≥ 75</option>
            <option value="90">IV Rank ≥ 90</option>
          </select>
        </div>
        <span className="text-sm text-muted-foreground">{trades.length} anomalies detected</span>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {["SYMBOL", "TYPE", "STRIKE", "EXPIRY", "DTE", "VOLUME", "OI", "VOL/OI", "IV", "IV RANK ↓", "PREMIUM", "TYPE", "SIGNAL"].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && trades.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No anomalies match current filters.</td></tr>
            ) : trades.map((t, i) => {
              const dteColor = t.dte <= 7 ? "text-red-400" : t.dte <= 14 ? "text-amber-400" : "";
              const volOiColor = t.volOi > 2 ? "text-amber-400" : "";
              return (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3 font-bold">{t.symbol}</td>
                  <td className={cn("px-3 py-3 font-bold text-xs", t.type === "CALL" ? "text-emerald-400" : "text-red-400")}>
                    {t.type}
                  </td>
                  <td className="px-3 py-3 tabular-nums">${t.strike.toLocaleString()}</td>
                  <td className="px-3 py-3 tabular-nums text-xs">{t.expiry}</td>
                  <td className={cn("px-3 py-3 tabular-nums text-xs font-medium", dteColor)}>{t.dte}d</td>
                  <td className="px-3 py-3 tabular-nums">{t.volume.toLocaleString()}</td>
                  <td className="px-3 py-3 tabular-nums">{t.oi.toLocaleString()}</td>
                  <td className={cn("px-3 py-3 tabular-nums font-medium", volOiColor)}>{t.volOi.toFixed(2)}</td>
                  <td className="px-3 py-3 tabular-nums text-amber-400">{t.ivPercent}</td>
                  <td className="px-3 py-3">
                    <IvRankBar rank={t.ivRank} />
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-emerald-400">{t.premium}</td>
                  <td className="px-3 py-3">
                    {t.tradeType === "Sweep" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                        <Zap className="h-3 w-3" />{t.tradeType}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                        {t.tradeType}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border",
                      t.signal === "Bullish" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                      t.signal === "Bearish" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      "bg-muted text-muted-foreground border-border"
                    )}>
                      {t.signal}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
