import { NextRequest, NextResponse } from "next/server";

const RANGE_MAP: Record<string, string> = {
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
};

const INTERVAL_MAP: Record<string, string> = {
  "1M": "1d",
  "3M": "1d",
  "6M": "1d",
  "1Y": "1wk",
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const tf = req.nextUrl.searchParams.get("tf") ?? "3M";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const range = RANGE_MAP[tf] ?? "3mo";
  const interval = INTERVAL_MAP[tf] ?? "1d";

  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
  };

  // Try v8/finance/chart; fall back to v8 on query2 host if blocked
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 120 } });
      if (!res.ok) continue;

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};

      const candles = timestamps
        .map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          open: (q.open as (number | null)[])[i],
          high: (q.high as (number | null)[])[i],
          low: (q.low as (number | null)[])[i],
          close: (q.close as (number | null)[])[i],
          volume: (q.volume as (number | null)[])[i] ?? 0,
        }))
        .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

      return NextResponse.json({ candles });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ candles: [] });
}
