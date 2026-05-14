import { NextRequest, NextResponse } from "next/server";

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

// ---------- Yahoo Finance ----------
async function fetchYahoo(symbol: string, range: string, interval: string): Promise<Candle[]> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        next: { revalidate: 120 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp?.length) continue;
      const q = result.indicators?.quote?.[0] ?? {};
      const candles: Candle[] = (result.timestamp as number[])
        .map((ts: number, i: number) => ({
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          open: (q.open as number[])[i],
          high: (q.high as number[])[i],
          low: (q.low as number[])[i],
          close: (q.close as number[])[i],
          volume: (q.volume as number[])?.[i] ?? 0,
        }))
        .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);
      if (candles.length) return candles;
    } catch {
      continue;
    }
  }
  return [];
}

// ---------- Twelve Data ----------
const TD_INTERVAL: Record<string, string> = { "1M": "1day", "3M": "1day", "6M": "1day", "1Y": "1week" };
const TD_OUTPUTSIZE: Record<string, number> = { "1M": 22, "3M": 66, "6M": 132, "1Y": 52 };

async function fetchTwelveData(symbol: string, tf: string): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return [];
  try {
    const interval = TD_INTERVAL[tf] ?? "1day";
    const outputsize = TD_OUTPUTSIZE[tf] ?? 66;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}&format=JSON`;
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === "error" || !Array.isArray(data.values)) return [];
    // Twelve Data returns newest-first; reverse to chronological
    return (data.values as { datetime: string; open: string; high: string; low: string; close: string; volume: string }[])
      .map((v) => ({
        date: v.datetime.slice(0, 10),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseInt(v.volume ?? "0", 10),
      }))
      .filter((c) => !isNaN(c.open))
      .reverse();
  } catch {
    return [];
  }
}

// ---------- Route ----------
const RANGE_MAP: Record<string, string> = { "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y" };
const INTERVAL_MAP: Record<string, string> = { "1M": "1d", "3M": "1d", "6M": "1d", "1Y": "1wk" };

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const tf = req.nextUrl.searchParams.get("tf") ?? "3M";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const range = RANGE_MAP[tf] ?? "3mo";
  const interval = INTERVAL_MAP[tf] ?? "1d";

  // Try Yahoo Finance first (free, no key), fall back to Twelve Data
  let candles = await fetchYahoo(symbol, range, interval);
  if (!candles.length) candles = await fetchTwelveData(symbol, tf);

  return NextResponse.json({ candles });
}
