"use client";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceLine {
  price: number;
  label: string;
  color: string;
  dash?: boolean;
}

interface CandlestickChartProps {
  symbol: string;
  priceLevels?: PriceLine[];
  className?: string;
}

const TIMEFRAMES = ["1M", "3M", "6M", "1Y"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const PADDING = { top: 16, right: 72, bottom: 48, left: 10 };
const VOL_HEIGHT_RATIO = 0.18;

// Resolved at runtime from CSS variables
function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function CandlestickChart({ symbol, priceLevels = [], className }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tf, setTf] = useState<Timeframe>("3M");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ candle: Candle; x: number; y: number } | null>(null);

  // CSS variable colors resolved once on mount (avoids SVG attribute CSS-var issues)
  const [colors, setColors] = useState({ border: "#334155", mutedFg: "#64748b", fg: "#f1f5f9", card: "#0f172a" });

  useEffect(() => {
    setColors({
      border: cssVar("--border") ? `hsl(${cssVar("--border")})` : "#334155",
      mutedFg: cssVar("--muted-foreground") ? `hsl(${cssVar("--muted-foreground")})` : "#64748b",
      fg: cssVar("--foreground") ? `hsl(${cssVar("--foreground")})` : "#f1f5f9",
      card: cssVar("--card") ? `hsl(${cssVar("--card")})` : "#0f172a",
    });
  }, []);

  // Measure width synchronously before paint, then keep updated via ResizeObserver
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setWidth(w > 0 ? w : 500);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch candles on symbol/tf change
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setCandles([]);
    fetch(`/api/instruments/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setCandles(d.candles ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, tf]);

  const height = 340;
  const plotH = height - PADDING.top - PADDING.bottom;
  const volH = plotH * VOL_HEIGHT_RATIO;
  const priceH = plotH - volH - 8;

  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  priceLevels.forEach((pl) => allPrices.push(pl.price));
  const dataMin = allPrices.length ? Math.min(...allPrices) : 0;
  const dataMax = allPrices.length ? Math.max(...allPrices) : 1;
  const pad = (dataMax - dataMin) * 0.06 || 1;
  const priceMin = dataMin - pad;
  const priceMax = dataMax + pad;
  const priceRange = priceMax - priceMin || 1;

  const volMax = candles.length ? Math.max(...candles.map((c) => c.volume)) : 1;

  const plotW = Math.max(1, width - PADDING.left - PADDING.right);
  const n = candles.length;
  const candleW = n > 0 ? Math.max(2, Math.min(16, plotW / n - 1)) : 8;
  const gap = n > 0 ? (plotW - candleW * n) / Math.max(n - 1, 1) : 0;

  const px = (i: number) => PADDING.left + i * (candleW + gap) + candleW / 2;
  const py = (price: number) => PADDING.top + priceH - ((price - priceMin) / priceRange) * priceH;

  const yTicks = 5;
  const tickPrices = Array.from({ length: yTicks }, (_, i) =>
    priceMin + (priceRange / (yTicks - 1)) * i
  );

  const xLabelIndices: number[] = [];
  if (n > 0) {
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) xLabelIndices.push(i);
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!n) return;
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mx = e.clientX - rect.left - PADDING.left;
      const idx = Math.min(n - 1, Math.max(0, Math.round(mx / (candleW + gap))));
      setTooltip({ candle: candles[idx], x: px(idx), y: PADDING.top + 8 });
    },
    [candles, n, candleW, gap]
  );

  const bodyColor = (c: Candle) => (c.close >= c.open ? "#10b981" : "#ef4444");

  return (
    <div ref={containerRef} className={cn("flex flex-col w-full", className)}>
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 mb-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTf(t)}
            className={cn(
              "px-2.5 py-0.5 rounded text-xs font-medium transition-colors",
              tf === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {t}
          </button>
        ))}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>

      {/* Chart */}
      <div className="relative rounded-md border border-border bg-card overflow-hidden" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No chart data for {symbol}
          </div>
        )}

        {candles.length > 0 && (
          <svg
            width={width}
            height={height}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
            style={{ display: "block" }}
          >
            {/* Y grid & labels */}
            {tickPrices.map((price, ti) => {
              const y = py(price);
              return (
                <g key={ti}>
                  <line
                    x1={PADDING.left} y1={y}
                    x2={width - PADDING.right} y2={y}
                    style={{ stroke: colors.border, strokeWidth: 0.5, strokeDasharray: "3 3" }}
                  />
                  <text
                    x={width - PADDING.right + 4} y={y + 3.5}
                    style={{ fontSize: 9, fill: colors.mutedFg }}
                    textAnchor="start"
                  >
                    {price >= 1000 ? price.toFixed(0) : price.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Price level lines */}
            {priceLevels.map((pl) => {
              if (!pl.price || pl.price < priceMin || pl.price > priceMax) return null;
              const y = py(pl.price);
              return (
                <g key={pl.label}>
                  <line
                    x1={PADDING.left} y1={y}
                    x2={width - PADDING.right} y2={y}
                    style={{
                      stroke: pl.color,
                      strokeWidth: 1.5,
                      strokeDasharray: pl.dash ? "5 3" : undefined,
                      opacity: 0.85,
                    }}
                  />
                  <rect
                    x={width - PADDING.right + 2} y={y - 8}
                    width={PADDING.right - 4} height={14}
                    rx={3}
                    style={{ fill: pl.color, opacity: 0.15 }}
                  />
                  <text
                    x={width - PADDING.right + 5} y={y + 3.5}
                    style={{ fontSize: 9, fill: pl.color, fontWeight: 600 }}
                  >
                    {pl.label}
                  </text>
                </g>
              );
            })}

            {/* Candlesticks */}
            {candles.map((c, i) => {
              const x = px(i);
              const bodyTop = py(Math.max(c.open, c.close));
              const bodyBot = py(Math.min(c.open, c.close));
              const bodyH = Math.max(1.5, bodyBot - bodyTop);
              const color = bodyColor(c);
              return (
                <g key={c.date}>
                  <line
                    x1={x} y1={py(c.high)}
                    x2={x} y2={py(c.low)}
                    style={{ stroke: color, strokeWidth: 1 }}
                  />
                  <rect
                    x={x - candleW / 2} y={bodyTop}
                    width={candleW} height={bodyH}
                    rx={candleW > 6 ? 1.5 : 0}
                    style={{ fill: color, opacity: c.close >= c.open ? 0.9 : 0.85 }}
                  />
                </g>
              );
            })}

            {/* Volume bars */}
            {candles.map((c, i) => {
              const x = px(i);
              const barH = Math.max(1, (c.volume / volMax) * volH);
              const color = bodyColor(c);
              return (
                <rect
                  key={`v${i}`}
                  x={x - candleW / 2}
                  y={PADDING.top + priceH + 8 + volH - barH}
                  width={candleW}
                  height={barH}
                  rx={candleW > 6 ? 1 : 0}
                  style={{ fill: color, opacity: 0.35 }}
                />
              );
            })}

            {/* X axis labels */}
            {xLabelIndices.map((i) => {
              const c = candles[i];
              const [, mm, dd] = c.date.split("-");
              return (
                <text
                  key={i}
                  x={px(i)} y={height - 6}
                  style={{ fontSize: 9, fill: colors.mutedFg }}
                  textAnchor="middle"
                >
                  {mm}/{dd}
                </text>
              );
            })}

            {/* Crosshair + tooltip */}
            {tooltip && (
              <>
                <line
                  x1={tooltip.x} y1={PADDING.top}
                  x2={tooltip.x} y2={PADDING.top + priceH}
                  style={{ stroke: colors.mutedFg, strokeWidth: 0.5, strokeDasharray: "3 2" }}
                />
                <TooltipBox
                  candle={tooltip.candle}
                  x={tooltip.x}
                  y={tooltip.y}
                  chartWidth={width}
                  padding={PADDING}
                  colors={colors}
                />
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

function TooltipBox({
  candle, x, y, chartWidth, padding, colors,
}: {
  candle: Candle;
  x: number;
  y: number;
  chartWidth: number;
  padding: typeof PADDING;
  colors: { border: string; mutedFg: string; fg: string; card: string };
}) {
  const boxW = 140;
  const boxH = 80;
  const margin = 6;
  const bx = x + margin + boxW > chartWidth - padding.right ? x - margin - boxW : x + margin;
  const isGreen = candle.close >= candle.open;

  const fmtVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return `${v}`;
  };

  const rows: [string, string][] = [
    ["Date", candle.date.slice(5)],
    ["O", candle.open.toFixed(2)],
    ["H", candle.high.toFixed(2)],
    ["L", candle.low.toFixed(2)],
    ["C", candle.close.toFixed(2)],
    ["Vol", fmtVol(candle.volume)],
  ];

  return (
    <g>
      <rect x={bx} y={y} width={boxW} height={boxH} rx={4}
        style={{ fill: colors.card, stroke: colors.border, strokeWidth: 1 }} />
      <rect x={bx} y={y} width={4} height={boxH} rx={2}
        style={{ fill: isGreen ? "#10b981" : "#ef4444" }} />
      {rows.map(([label, val], i) => (
        <g key={label}>
          <text x={bx + 10} y={y + 13 + i * 12} style={{ fontSize: 9, fill: colors.mutedFg }}>{label}</text>
          <text x={bx + 36} y={y + 13 + i * 12} style={{ fontSize: 9, fill: colors.fg, fontWeight: 500 }}>{val}</text>
        </g>
      ))}
    </g>
  );
}
