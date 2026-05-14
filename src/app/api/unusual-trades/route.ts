import { NextResponse } from "next/server";

interface Trade {
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

const baseTrades: Trade[] = [
  { symbol: "AMC", type: "CALL", strike: 4, expiry: "05/17", dte: 3, volume: 65400, oi: 18200, volOi: 3.59, iv: 3.124, ivPercent: "312.4%", ivRank: 97, premium: "$580K", tradeType: "Block", signal: "Bullish" },
  { symbol: "SPCE", type: "CALL", strike: 2, expiry: "05/17", dte: 3, volume: 42100, oi: 11200, volOi: 3.76, iv: 2.842, ivPercent: "284.2%", ivRank: 96, premium: "$310K", tradeType: "Block", signal: "Bullish" },
  { symbol: "GME", type: "CALL", strike: 25, expiry: "05/17", dte: 3, volume: 48200, oi: 12100, volOi: 3.98, iv: 2.284, ivPercent: "228.4%", ivRank: 94, premium: "$2.1M", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "BBAI", type: "CALL", strike: 4, expiry: "06/20", dte: 37, volume: 14800, oi: 5200, volOi: 2.85, iv: 1.582, ivPercent: "158.2%", ivRank: 93, premium: "$480K", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "MARA", type: "CALL", strike: 22, expiry: "05/23", dte: 9, volume: 28400, oi: 8900, volOi: 3.19, iv: 1.682, ivPercent: "168.4%", ivRank: 92, premium: "$820K", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "MSTR", type: "PUT", strike: 1200, expiry: "05/17", dte: 3, volume: 8400, oi: 3100, volOi: 2.71, iv: 1.421, ivPercent: "142.1%", ivRank: 91, premium: "$1.2M", tradeType: "Sweep", signal: "Bearish" },
  { symbol: "SOFI", type: "CALL", strike: 10, expiry: "05/17", dte: 3, volume: 38200, oi: 14100, volOi: 2.71, iv: 1.084, ivPercent: "108.4%", ivRank: 89, premium: "$560K", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "NVDA", type: "CALL", strike: 950, expiry: "05/30", dte: 16, volume: 12400, oi: 8200, volOi: 1.51, iv: 0.728, ivPercent: "72.8%", ivRank: 88, premium: "$4.8M", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "COIN", type: "PUT", strike: 210, expiry: "05/31", dte: 17, volume: 9200, oi: 6400, volOi: 1.44, iv: 0.948, ivPercent: "94.8%", ivRank: 85, premium: "$1.6M", tradeType: "Block", signal: "Bearish" },
  { symbol: "TSLA", type: "PUT", strike: 160, expiry: "05/23", dte: 9, volume: 22100, oi: 14800, volOi: 1.49, iv: 0.884, ivPercent: "88.4%", ivRank: 82, premium: "$1.9M", tradeType: "Block", signal: "Bearish" },
  { symbol: "PLTR", type: "CALL", strike: 28, expiry: "06/20", dte: 37, volume: 18900, oi: 24100, volOi: 0.78, iv: 0.752, ivPercent: "75.2%", ivRank: 78, premium: "$2.4M", tradeType: "Sweep", signal: "Bullish" },
  { symbol: "AMD", type: "PUT", strike: 155, expiry: "05/31", dte: 17, volume: 11200, oi: 9800, volOi: 1.14, iv: 0.824, ivPercent: "82.4%", ivRank: 74, premium: "$1.1M", tradeType: "Block", signal: "Bearish" },
];

function getIvRangeLabel(ivRank: number): string {
  if (ivRank < 50) return "50-75"; // shouldn't appear but fallback
  if (ivRank < 75) return "50-75";
  if (ivRank < 90) return "75-90"; // mapped to 75-100 bucket
  return "90+";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get("type") ?? "all";
  const sentimentFilter = searchParams.get("sentiment") ?? "all";
  const tradeTypeFilter = searchParams.get("tradeType") ?? "all";
  const ivRankFilter = searchParams.get("ivRank") ?? "any";

  const filtered = baseTrades.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (sentimentFilter !== "all" && t.signal !== sentimentFilter) return false;
    if (tradeTypeFilter !== "all" && t.tradeType !== tradeTypeFilter) return false;
    if (ivRankFilter !== "any") {
      const minIvRank = parseInt(ivRankFilter, 10);
      if (!isNaN(minIvRank) && t.ivRank < minIvRank) return false;
    }
    return true;
  });

  const totalSignals = filtered.length;
  const bullishFlow = filtered.filter((t) => t.signal === "Bullish").length;
  const bearishFlow = filtered.filter((t) => t.signal === "Bearish").length;
  const avgIvRank = totalSignals > 0
    ? parseFloat((filtered.reduce((sum, t) => sum + t.ivRank, 0) / totalSignals).toFixed(1))
    : 0;

  // IV distribution by ivRank ranges
  const distRanges = [
    { range: "50-75", min: 50, max: 75 },
    { range: "75-100", min: 75, max: 100 },
    { range: "100-150", min: 100, max: 150 },
    { range: "150-200", min: 150, max: 200 },
    { range: "200+", min: 200, max: Infinity },
  ];

  // For distribution, use all base trades (unfiltered) to show full picture
  const ivDistribution = distRanges.map(({ range, min, max }) => ({
    range,
    count: filtered.filter((t) => t.ivRank >= min && t.ivRank < max).length,
  }));

  return NextResponse.json({
    summary: {
      totalSignals,
      bullishFlow,
      bearishFlow,
      avgIvRank,
      ivDistribution,
    },
    trades: filtered,
  });
}
