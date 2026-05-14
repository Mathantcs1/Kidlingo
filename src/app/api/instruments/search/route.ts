import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    const quotes = (data.quotes ?? [])
      .filter((q: Record<string, unknown>) => q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "INDEX")
      .slice(0, 8)
      .map((q: Record<string, unknown>) => ({
        symbol: q.symbol,
        shortName: q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchange,
        type: q.quoteType,
      }));
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json([]);
  }
}
