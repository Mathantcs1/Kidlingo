import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  const tf = req.nextUrl.searchParams.get("tf") ?? "3M";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const range = RANGE_MAP[tf] ?? "3mo";
  const interval = INTERVAL_MAP[tf] ?? "1d";

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
        "Accept": "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return NextResponse.json({ candles: [] });

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return NextResponse.json({ candles: [] });

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const candles = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i],
      }))
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

    return NextResponse.json({ candles });
  } catch {
    return NextResponse.json({ candles: [] });
  }
}
