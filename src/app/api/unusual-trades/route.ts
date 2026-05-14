import { NextRequest, NextResponse } from "next/server";

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

interface YahooOption {
  strike: number;
  lastPrice: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  expiration: number;
  inTheMoney: boolean;
}

// ── Yahoo Finance options chain ────────────────────────────────────────────────
async function fetchOptionsChain(symbol: string): Promise<{ calls: YahooOption[]; puts: YahooOption[] }> {
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v7/finance/options/${encodeURIComponent(symbol)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://finance.yahoo.com/",
            "Origin": "https://finance.yahoo.com",
          },
          next: { revalidate: 120 },
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const chain = data?.optionChain?.result?.[0]?.options?.[0];
      if (!chain) continue;
      const calls: YahooOption[] = chain.calls ?? [];
      const puts: YahooOption[]  = chain.puts  ?? [];
      if (calls.length === 0 && puts.length === 0) continue;
      return { calls, puts };
    } catch {
      continue;
    }
  }
  throw new Error(`Options unavailable for ${symbol}`);
}

function fmtExpiry(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function calcDTE(ts: number): number {
  return Math.max(0, Math.round((ts * 1000 - Date.now()) / 86400000));
}

function fmtPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function calcIvRank(iv: number, allIvs: number[]): number {
  if (allIvs.length < 2) return Math.min(99, Math.round(iv * 80));
  const min = Math.min(...allIvs);
  const max = Math.max(...allIvs);
  if (max === min) return 50;
  return Math.round(((iv - min) / (max - min)) * 100);
}

function processChain(
  symbol: string,
  calls: YahooOption[],
  puts: YahooOption[],
  allIvs: number[]
): UnusualTrade[] {
  const results: UnusualTrade[] = [];

  function process(opts: YahooOption[], type: "CALL" | "PUT") {
    for (const o of opts) {
      const vol = o.volume ?? 0;
      const oi  = o.openInterest ?? 0;
      const iv  = o.impliedVolatility ?? 0;
      if (vol < 500 || oi < 100 || iv < 0.2) continue;
      const volOi = oi > 0 ? parseFloat((vol / oi).toFixed(2)) : 0;
      if (volOi < 0.8) continue;
      const premium = vol * o.lastPrice * 100;
      if (premium < 50000) continue;
      const ivRank    = calcIvRank(iv, allIvs);
      const dte       = calcDTE(o.expiration);
      const tradeType: "Block" | "Sweep" = premium > 500000 ? "Sweep" : "Block";
      const signal: "Bullish" | "Bearish" = type === "CALL" ? "Bullish" : "Bearish";
      results.push({
        symbol, type, strike: o.strike,
        expiry: fmtExpiry(o.expiration), dte, volume: vol, oi, volOi,
        iv: parseFloat(iv.toFixed(3)),
        ivPercent: `${(iv * 100).toFixed(1)}%`,
        ivRank, premium: fmtPremium(premium), tradeType, signal,
      });
    }
  }

  process(calls, "CALL");
  process(puts,  "PUT");
  return results;
}

async function fetchRealUnusualTrades(): Promise<UnusualTrade[]> {
  const watchlist = ["NVDA","TSLA","AAPL","AMD","MSTR","SOFI","GME","PLTR","COIN","META"];
  const allTrades: UnusualTrade[] = [];

  await Promise.allSettled(
    watchlist.map(async (symbol) => {
      try {
        const { calls, puts } = await fetchOptionsChain(symbol);
        const allIvs = [...calls, ...puts]
          .map((o) => o.impliedVolatility ?? 0)
          .filter((v) => v > 0);
        allTrades.push(...processChain(symbol, calls, puts, allIvs));
      } catch {
        // skip symbol
      }
    })
  );

  return allTrades.sort((a, b) => b.ivRank - a.ivRank).slice(0, 15);
}

// ── Simulated fallback ─────────────────────────────────────────────────────────
const SIM_TRADES: UnusualTrade[] = [
  { symbol:"AMC",  type:"CALL", strike:4,    expiry:"05/17", dte:3,  volume:65400, oi:18200, volOi:3.59, iv:3.124, ivPercent:"312.4%", ivRank:97, premium:"$580K",  tradeType:"Block", signal:"Bullish" },
  { symbol:"SPCE", type:"CALL", strike:2,    expiry:"05/17", dte:3,  volume:42100, oi:11200, volOi:3.76, iv:2.842, ivPercent:"284.2%", ivRank:96, premium:"$310K",  tradeType:"Block", signal:"Bullish" },
  { symbol:"GME",  type:"CALL", strike:25,   expiry:"05/17", dte:3,  volume:48200, oi:12100, volOi:3.98, iv:2.284, ivPercent:"228.4%", ivRank:94, premium:"$2.1M",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"BBAI", type:"CALL", strike:4,    expiry:"06/20", dte:37, volume:14800, oi:5200,  volOi:2.85, iv:1.582, ivPercent:"158.2%", ivRank:93, premium:"$480K",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"MARA", type:"CALL", strike:22,   expiry:"05/23", dte:9,  volume:28400, oi:8900,  volOi:3.19, iv:1.682, ivPercent:"168.4%", ivRank:92, premium:"$820K",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"MSTR", type:"PUT",  strike:1200, expiry:"05/17", dte:3,  volume:8400,  oi:3100,  volOi:2.71, iv:1.421, ivPercent:"142.1%", ivRank:91, premium:"$1.2M",  tradeType:"Sweep", signal:"Bearish" },
  { symbol:"SOFI", type:"CALL", strike:10,   expiry:"05/17", dte:3,  volume:38200, oi:14100, volOi:2.71, iv:1.084, ivPercent:"108.4%", ivRank:89, premium:"$560K",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"NVDA", type:"CALL", strike:950,  expiry:"05/30", dte:16, volume:12400, oi:8200,  volOi:1.51, iv:0.728, ivPercent:"72.8%",  ivRank:88, premium:"$4.8M",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"COIN", type:"PUT",  strike:210,  expiry:"05/31", dte:17, volume:9200,  oi:6400,  volOi:1.44, iv:0.948, ivPercent:"94.8%",  ivRank:85, premium:"$1.6M",  tradeType:"Block", signal:"Bearish" },
  { symbol:"TSLA", type:"PUT",  strike:160,  expiry:"05/23", dte:9,  volume:22100, oi:14800, volOi:1.49, iv:0.884, ivPercent:"88.4%",  ivRank:82, premium:"$1.9M",  tradeType:"Block", signal:"Bearish" },
  { symbol:"PLTR", type:"CALL", strike:28,   expiry:"06/20", dte:37, volume:18900, oi:24100, volOi:0.78, iv:0.752, ivPercent:"75.2%",  ivRank:78, premium:"$2.4M",  tradeType:"Sweep", signal:"Bullish" },
  { symbol:"AMD",  type:"PUT",  strike:155,  expiry:"05/31", dte:17, volume:11200, oi:9800,  volOi:1.14, iv:0.824, ivPercent:"82.4%",  ivRank:74, premium:"$1.1M",  tradeType:"Block", signal:"Bearish" },
];

// ── Route handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const typeFilter      = req.nextUrl.searchParams.get("type")      ?? "all";
  const sentimentFilter = req.nextUrl.searchParams.get("sentiment") ?? "all";
  const tradeTypeFilter = req.nextUrl.searchParams.get("tradeType") ?? "all";
  const ivRankFilter    = req.nextUrl.searchParams.get("ivRank")    ?? "any";

  let allTrades: UnusualTrade[];
  let usingReal = false;

  try {
    const real = await fetchRealUnusualTrades();
    if (real.length > 0) {
      allTrades = real;
      usingReal = true;
    } else {
      allTrades = SIM_TRADES;
    }
  } catch {
    allTrades = SIM_TRADES;
  }

  const filtered = allTrades.filter((t) => {
    if (typeFilter      !== "all" && t.type      !== typeFilter)      return false;
    if (sentimentFilter !== "all" && t.signal    !== sentimentFilter) return false;
    if (tradeTypeFilter !== "all" && t.tradeType !== tradeTypeFilter) return false;
    if (ivRankFilter !== "any") {
      const min = parseInt(ivRankFilter, 10);
      if (!isNaN(min) && t.ivRank < min) return false;
    }
    return true;
  });

  const totalSignals = filtered.length;
  const bullishFlow  = filtered.filter((t) => t.signal === "Bullish").length;
  const bearishFlow  = filtered.filter((t) => t.signal === "Bearish").length;
  const avgIvRank    = totalSignals > 0
    ? parseFloat((filtered.reduce((s, t) => s + t.ivRank, 0) / totalSignals).toFixed(1))
    : 0;

  const distRanges = [
    { range: "50-75",  min: 50,  max: 75  },
    { range: "75-100", min: 75,  max: 100 },
    { range: "100-150",min: 100, max: 150 },
    { range: "150-200",min: 150, max: 200 },
    { range: "200+",   min: 200, max: Infinity },
  ];
  const ivDistribution = distRanges.map(({ range, min, max }) => ({
    range,
    count: filtered.filter((t) => t.ivRank >= min && t.ivRank < max).length,
  }));

  return NextResponse.json({
    summary: { totalSignals, bullishFlow, bearishFlow, avgIvRank, ivDistribution },
    trades: filtered,
    usingReal,
  });
}
