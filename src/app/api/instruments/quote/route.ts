import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,assetProfile,summaryDetail`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return NextResponse.json({ error: "No data" }, { status: 404 });

    const price = result.price ?? {};
    const profile = result.assetProfile ?? {};
    const summary = result.summaryDetail ?? {};

    return NextResponse.json({
      symbol,
      name: price.shortName ?? price.longName ?? symbol,
      price: price.regularMarketPrice?.raw ?? null,
      change: price.regularMarketChange?.raw ?? null,
      changePercent: price.regularMarketChangePercent?.raw ?? null,
      marketCap: price.marketCap?.raw ?? null,
      volume: price.regularMarketVolume?.raw ?? null,
      high52: summary.fiftyTwoWeekHigh?.raw ?? null,
      low52: summary.fiftyTwoWeekLow?.raw ?? null,
      pe: summary.trailingPE?.raw ?? null,
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
      description: profile.longBusinessSummary ?? null,
      currency: price.currency ?? "USD",
      exchange: price.exchangeName ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 });
  }
}
