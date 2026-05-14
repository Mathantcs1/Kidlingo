"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, AlertTriangle } from "lucide-react";

interface ScannerResult {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  relVolume: number;
  rsi: number;
  marketCap: string;
  signal: string;
  sector: string;
  sparkline: number[];
}

interface ScannerResponse {
  results: ScannerResult[];
  sectors: string[];
  usingReal: boolean;
  lastUpdated: string;
}

const TABS = [
  { id: "momentum", label: "Momentum / Breakout" },
  { id: "volume", label: "Volume Spike" },
  { id: "options", label: "Options Flow" },
  { id: "gap", label: "Gap Scanner" },
];

const SIGNAL_OPTIONS = [
  { value: "all", label: "All Signals" },
  { value: "Strong Breakout", label: "Strong Breakout" },
  { value: "Breakout", label: "Breakout" },
  { value: "Momentum", label: "Momentum" },
  { value: "Consolidation", label: "Consolidation" },
  { value: "Neutral", label: "Neutral" },
];

function signalBadgeClass(signal: string): string {
  switch (signal) {
    case "Strong Breakout":
      return "bg-orange-500/20 text-orange-400 border border-orange-500/30";
    case "Breakout":
      return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    case "Momentum":
      return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
    case "Consolidation":
      return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground border";
  }
}

function SparklineSVG({ data, trend }: { data: number[]; trend: "up" | "down" }) {
  if (!data || data.length < 2) return null;
  const width = 80;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = trend === "up" ? "#22c55e" : "#ef4444";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ScannersPage() {
  const [activeTab, setActiveTab] = useState("momentum");
  const [signalFilter, setSignalFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [data, setData] = useState<ScannerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab: activeTab, signal: signalFilter, sector: sectorFilter });
    try {
      const res = await fetch(`/api/scanners?${params}`);
      const json: ScannerResponse = await res.json();
      setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, signalFilter, sectorFilter]);

  // Refresh data when tab or filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Countdown timer + auto-refresh every 30s
  useEffect(() => {
    countdownRef.current = 30;
    setCountdown(30);
    const interval = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = 30;
        setCountdown(30);
        fetchData();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function handleManualRefresh() {
    countdownRef.current = 30;
    setCountdown(30);
    fetchData();
  }

  function handleExport() {
    if (!data?.results) return;
    const headers = ["Symbol", "Name", "Price", "Chg%", "Vol(M)", "RelVol", "RSI", "MktCap", "Signal", "Sector"];
    const rows = data.results.map((r) => [
      r.symbol,
      `"${r.name}"`,
      r.price.toFixed(2),
      r.changePercent.toFixed(2),
      r.volume.toFixed(1),
      r.relVolume.toFixed(2),
      r.rsi.toFixed(1),
      r.marketCap,
      r.signal,
      r.sector,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scanners-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sectors = data?.sectors ?? [];
  const results = data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Scanners</h1>
          <p className="text-muted-foreground text-sm">Real-time market screening</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
            Live · {countdown}s
          </span>
          <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Info banner */}
      {data?.usingReal ? (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
          <span>Live data via <strong>Polygon.io</strong> — prices delayed up to 15 min on free tier.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Using simulated data. Add <strong>POLYGON_API_KEY</strong> to your environment for live market data.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters + count */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {SIGNAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">{results.length} results</span>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">SYMBOL</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">PRICE</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">CHG % <span className="text-xs">↓</span></span>
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">VOL (M)</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">REL.VOL</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">RSI</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">MKT CAP</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">SIGNAL</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">7-DAY</th>
            </tr>
          </thead>
          <tbody>
            {loading && results.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No results match the current filters.
                </td>
              </tr>
            ) : (
              results.map((r) => {
                const isUp = r.changePercent >= 0;
                const rsiColor =
                  r.rsi > 70 ? "text-red-400" : r.rsi >= 60 ? "text-amber-400" : "";
                const relVolColor = r.relVolume >= 1.5 ? "text-amber-400" : "";
                return (
                  <tr key={r.symbol} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">{r.symbol}</div>
                      <div className="text-xs text-muted-foreground">{r.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      ${r.price.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${isUp ? "text-green-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{r.changePercent.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.volume.toFixed(1)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${relVolColor}`}>
                      {r.relVolume.toFixed(2)}x
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${rsiColor}`}>
                      {r.rsi.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.marketCap}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${signalBadgeClass(r.signal)}`}>
                        {r.signal}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex justify-center">
                      <SparklineSVG data={r.sparkline} trend={isUp ? "up" : "down"} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
