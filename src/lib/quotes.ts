// Fetch current price for an instrument using Alpha Vantage or Yahoo Finance fallback
export async function getCurrentPrice(instrument: string): Promise<number | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  // Try Alpha Vantage if key is configured
  if (apiKey) {
    try {
      const symbol = instrument.replace("/", "").replace("-", "");
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 30 } });
      if (res.ok) {
        const data = await res.json();
        const price = data?.["Global Quote"]?.["05. price"];
        if (price) return parseFloat(price);
      }
    } catch {
      // fall through to Yahoo Finance
    }
  }

  // Fallback: Yahoo Finance unofficial endpoint
  try {
    const symbol = instrument.replace("/", "-");
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return price;
    }
  } catch {
    // unable to fetch
  }

  return null;
}
