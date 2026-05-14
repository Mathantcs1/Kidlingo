import { NextRequest, NextResponse } from "next/server";

// ── Watchlists per tab ─────────────────────────────────────────────────────────
const WATCHLISTS: Record<string, string[]> = {
  momentum: ["SOFI","MSTR","PLTR","COIN","NVDA","AMD","META","AMZN","TSLA","AAPL","MSFT","GOOGL","NFLX","SMCI","IONQ"],
  volume:   ["GME","AMC","MARA","RIOT","BBAI","SPCE","SOUN","CLSK","HUT","SMCI","RIVN","LCID","COIN","SOFI","PLTR"],
  options:  ["NVDA","TSLA","AAPL","AMD","META","AMZN","MSFT","GOOGL","NFLX","COIN","SPY","QQQ","BABA","SNAP","UBER"],
  gap:      ["OKLO","RKLB","IONQ","PATH","DJT","RIVN","LCID","BYND","PARA","SOFI","MSTR","GME","AMC","MARA","APPS"],
};

const SECTORS: Record<string, string> = {
  AAPL:"Technology",MSFT:"Technology",NVDA:"Technology",TSLA:"Consumer",AMZN:"Consumer",
  META:"Technology",GOOGL:"Technology",AMD:"Technology",COIN:"Financials",PLTR:"Technology",
  SOFI:"Financials",MSTR:"Technology",GME:"Consumer",AMC:"Consumer",MARA:"Technology",
  RIOT:"Technology",BBAI:"Technology",SPCE:"Aerospace",SOUN:"Technology",CLSK:"Energy",
  HUT:"Technology",SMCI:"Technology",NFLX:"Consumer",OKLO:"Energy",RKLB:"Aerospace",
  IONQ:"Technology",PATH:"Technology",RIVN:"Consumer",LCID:"Consumer",SPY:"ETF",
  QQQ:"ETF",DJT:"Media",BYND:"Consumer",PARA:"Media",APPS:"Technology",
  BABA:"Consumer",SNAP:"Technology",UBER:"Consumer",
};

// ── Yahoo Finance v8 chart (no crumb/cookie needed) ───────────────────────────
interface V8Meta {
  symbol?: string;
  shortName?: string;
  regularMarketPrice: number;
  previousClose: number;
  regularMarketOpen?: number;
  regularMarketVolume?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
}

async function fetchYahooV8(symbol: string): Promise<{
  price: number; changePercent: number; volume: number; relVolume: number;
  marketCap: number; openPrice: number; prevClose: number;
  name: string; sparkline: number[];
} | null> {
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1wk&includePrePost=false`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com/",
          "Origin": "https://finance.yahoo.com",
        },
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta: V8Meta = result?.meta;
      if (!meta?.regularMarketPrice) continue;

      const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
      const sparkline = closes.filter((v): v is number => v !== null && !isNaN(v)).slice(-7);

      const vol = meta.regularMarketVolume ?? 0;
      const avgVol = meta.averageDailyVolume10Day ?? 0;
      const relVolume = avgVol > 0 ? parseFloat((vol / avgVol).toFixed(2)) : 1;
      const changePercent = meta.previousClose > 0
        ? parseFloat(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2))
        : 0;

      return {
        price: meta.regularMarketPrice,
        changePercent,
        volume: parseFloat((vol / 1e6).toFixed(1)),
        relVolume,
        marketCap: meta.marketCap ?? 0,
        openPrice: meta.regularMarketOpen ?? meta.regularMarketPrice,
        prevClose: meta.previousClose,
        name: meta.shortName ?? symbol,
        sparkline,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ── Twelve Data batch quotes (fallback) ───────────────────────────────────────
interface TwelveQuote {
  symbol?: string;
  name?: string;
  close?: string;
  percent_change?: string;
  volume?: string;
  average_volume?: string;
  open?: string;
  previous_close?: string;
  status?: string;
}

async function fetchTwelveDataQuotes(symbols: string[]): Promise<Record<string, TwelveQuote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return {};
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${symbols.join(",")}&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const data = await res.json();
    // Single symbol returns object directly; multiple returns object keyed by symbol
    if (symbols.length === 1) {
      return data?.symbol ? { [data.symbol]: data as TwelveQuote } : {};
    }
    const result: Record<string, TwelveQuote> = {};
    for (const sym of symbols) {
      if (data[sym]?.symbol) result[sym] = data[sym] as TwelveQuote;
    }
    return result;
  } catch {
    return {};
  }
}

// ── Twelve Data RSI (1hr cache to stay within free-tier 800 credits/day) ──────
const RSI_SEED: Record<string, number> = {
  NVDA:72,TSLA:58,AAPL:54,AMD:66,META:68,AMZN:65,MSFT:55,GOOGL:58,
  COIN:71,PLTR:74,SOFI:78,MSTR:76,GME:81,AMC:79,MARA:77,RIOT:74,
  BBAI:83,SPCE:80,SOUN:71,CLSK:68,HUT:65,SMCI:62,NFLX:63,BABA:52,
  OKLO:84,RKLB:81,IONQ:79,PATH:76,DJT:28,RIVN:31,LCID:34,BYND:38,PARA:42,
};

async function fetchRSI(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return RSI_SEED[symbol] ?? 50;
  try {
    const url = `https://api.twelvedata.com/rsi?symbol=${encodeURIComponent(symbol)}&interval=1day&time_period=14&outputsize=1&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // 1hr cache
    if (!res.ok) return RSI_SEED[symbol] ?? 50;
    const data = await res.json();
    if (data.status === "error") return RSI_SEED[symbol] ?? 50;
    const v = parseFloat(data.values?.[0]?.rsi ?? "");
    return isNaN(v) ? (RSI_SEED[symbol] ?? 50) : parseFloat(v.toFixed(1));
  } catch {
    return RSI_SEED[symbol] ?? 50;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMktCap(n: number): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n}`;
}

// Hardcoded market caps as reference for Twelve Data fallback (updated ~2025)
const MKTCAP_FALLBACK: Record<string, number> = {
  AAPL:3e12,MSFT:3.1e12,NVDA:2.4e12,AMZN:1.9e12,GOOGL:2.2e12,META:1.3e12,TSLA:5.5e11,
  MSFT2:3.1e12,AMD:2.6e11,COIN:5.8e10,PLTR:5.3e10,SOFI:9e9,MSTR:2.4e10,GME:5.2e9,
  AMC:1.8e9,MARA:4.8e9,RIOT:3.1e9,BBAI:8e8,SPCE:6e8,SOUN:2.7e9,CLSK:2.9e9,HUT:1.5e9,
  SMCI:5e10,NFLX:2.7e11,OKLO:3.8e9,RKLB:4.1e9,IONQ:2.8e9,PATH:8.4e9,RIVN:1.2e10,
  LCID:6.4e9,SPY:0,QQQ:0,DJT:6.1e9,BYND:5e8,PARA:6.8e9,APPS:4e8,BABA:2.2e11,
  SNAP:2e10,UBER:1.3e11,
};

function deriveSignal(chg: number, relVol: number, rsi: number): string {
  if ((chg > 6 || rsi > 75) && relVol > 1.7) return "Strong Breakout";
  if ((chg > 3 || rsi > 65) && relVol > 1.3) return "Breakout";
  if (chg > 1 || rsi > 55) return "Momentum";
  if (chg >= -2) return "Consolidation";
  return "Neutral";
}

function syntheticSparkline(price: number, chg: number): number[] {
  const pts: number[] = [];
  let p = price * (1 - Math.abs(chg) * 0.007);
  for (let i = 0; i < 7; i++) {
    p *= 1 + (chg > 0 ? 0.003 : -0.003) + (Math.random() * 0.004 - 0.002);
    pts.push(parseFloat(p.toFixed(2)));
  }
  return pts;
}

// ── Simulated fallback ─────────────────────────────────────────────────────────
type SimRow = { symbol:string; name:string; price:number; changePercent:number; volume:number; relVolume:number; rsi:number; marketCap:string; signal:string; sector:string };
const SIM: Record<string, SimRow[]> = {
  momentum: [
    {symbol:"SOFI",name:"SoFi Technologies",price:9.42,changePercent:8.91,volume:95.1,relVolume:1.97,rsi:78.2,marketCap:"$9.1B",signal:"Strong Breakout",sector:"Financials"},
    {symbol:"MSTR",name:"MicroStrategy",price:1342.10,changePercent:7.84,volume:4.2,relVolume:1.50,rsi:76.1,marketCap:"$23.2B",signal:"Strong Breakout",sector:"Technology"},
    {symbol:"PLTR",name:"Palantir Technologies",price:24.87,changePercent:6.54,volume:82.4,relVolume:1.82,rsi:74.8,marketCap:"$53.4B",signal:"Breakout",sector:"Technology"},
    {symbol:"COIN",name:"Coinbase Global",price:228.90,changePercent:5.22,volume:18.9,relVolume:1.66,rsi:71.5,marketCap:"$57.8B",signal:"Breakout",sector:"Financials"},
    {symbol:"NVDA",name:"NVIDIA Corp",price:891.20,changePercent:4.82,volume:48.2,relVolume:1.55,rsi:72.4,marketCap:"$2.19T",signal:"Breakout",sector:"Technology"},
    {symbol:"AMD",name:"Advanced Micro Devices",price:162.55,changePercent:3.45,volume:58.7,relVolume:1.39,rsi:66.8,marketCap:"$261.8B",signal:"Momentum",sector:"Technology"},
    {symbol:"META",name:"Meta Platforms",price:503.45,changePercent:3.21,volume:22.1,relVolume:1.40,rsi:68.1,marketCap:"$1.28T",signal:"Momentum",sector:"Technology"},
    {symbol:"AMZN",name:"Amazon.com",price:182.34,changePercent:2.18,volume:31.5,relVolume:1.43,rsi:65.3,marketCap:"$1.88T",signal:"Momentum",sector:"Consumer"},
    {symbol:"TSLA",name:"Tesla Inc",price:175.22,changePercent:1.94,volume:102.3,relVolume:1.21,rsi:58.2,marketCap:"$558B",signal:"Consolidation",sector:"Consumer"},
    {symbol:"AAPL",name:"Apple Inc",price:191.45,changePercent:0.87,volume:42.1,relVolume:1.10,rsi:54.1,marketCap:"$2.94T",signal:"Neutral",sector:"Technology"},
  ],
  volume: [
    {symbol:"GME",name:"GameStop",price:14.82,changePercent:12.44,volume:184.2,relVolume:4.21,rsi:81.3,marketCap:"$5.2B",signal:"Strong Breakout",sector:"Consumer"},
    {symbol:"AMC",name:"AMC Entertainment",price:4.18,changePercent:9.87,volume:142.6,relVolume:3.88,rsi:79.4,marketCap:"$1.8B",signal:"Strong Breakout",sector:"Consumer"},
    {symbol:"MARA",name:"Marathon Digital",price:21.34,changePercent:8.12,volume:68.4,relVolume:3.22,rsi:77.1,marketCap:"$4.8B",signal:"Breakout",sector:"Technology"},
    {symbol:"RIOT",name:"Riot Platforms",price:12.78,changePercent:7.55,volume:54.8,relVolume:2.95,rsi:74.6,marketCap:"$3.1B",signal:"Breakout",sector:"Technology"},
    {symbol:"BBAI",name:"BigBear.ai",price:3.24,changePercent:15.32,volume:38.2,relVolume:5.14,rsi:83.2,marketCap:"$0.8B",signal:"Strong Breakout",sector:"Technology"},
    {symbol:"SPCE",name:"Virgin Galactic",price:2.15,changePercent:11.98,volume:92.1,relVolume:4.67,rsi:80.4,marketCap:"$0.6B",signal:"Strong Breakout",sector:"Aerospace"},
    {symbol:"SOUN",name:"SoundHound AI",price:7.82,changePercent:6.44,volume:45.3,relVolume:2.78,rsi:71.2,marketCap:"$2.7B",signal:"Breakout",sector:"Technology"},
    {symbol:"CLSK",name:"CleanSpark",price:18.94,changePercent:5.88,volume:29.7,relVolume:2.41,rsi:68.9,marketCap:"$2.9B",signal:"Momentum",sector:"Energy"},
    {symbol:"HUT",name:"Hut 8 Mining",price:11.22,changePercent:4.33,volume:22.4,relVolume:2.12,rsi:65.4,marketCap:"$1.5B",signal:"Momentum",sector:"Technology"},
    {symbol:"SMCI",name:"Super Micro Computer",price:848.10,changePercent:3.21,volume:8.9,relVolume:1.88,rsi:62.3,marketCap:"$49.8B",signal:"Momentum",sector:"Technology"},
  ],
  options: [
    {symbol:"NVDA",name:"NVIDIA Corp",price:891.20,changePercent:4.82,volume:48.2,relVolume:1.55,rsi:72.4,marketCap:"$2.19T",signal:"Breakout",sector:"Technology"},
    {symbol:"TSLA",name:"Tesla Inc",price:175.22,changePercent:1.94,volume:102.3,relVolume:1.21,rsi:58.2,marketCap:"$558B",signal:"Momentum",sector:"Consumer"},
    {symbol:"AAPL",name:"Apple Inc",price:191.45,changePercent:0.87,volume:42.1,relVolume:1.10,rsi:54.1,marketCap:"$2.94T",signal:"Neutral",sector:"Technology"},
    {symbol:"SPY",name:"SPDR S&P 500 ETF",price:524.88,changePercent:0.54,volume:68.2,relVolume:0.92,rsi:51.3,marketCap:"—",signal:"Neutral",sector:"ETF"},
    {symbol:"QQQ",name:"Invesco QQQ ETF",price:447.22,changePercent:0.88,volume:34.1,relVolume:0.98,rsi:53.8,marketCap:"—",signal:"Neutral",sector:"ETF"},
    {symbol:"MSFT",name:"Microsoft Corp",price:414.32,changePercent:1.22,volume:18.4,relVolume:1.12,rsi:55.2,marketCap:"$3.08T",signal:"Momentum",sector:"Technology"},
    {symbol:"AMZN",name:"Amazon.com",price:182.34,changePercent:2.18,volume:31.5,relVolume:1.43,rsi:65.3,marketCap:"$1.88T",signal:"Momentum",sector:"Consumer"},
    {symbol:"GOOGL",name:"Alphabet Inc",price:171.96,changePercent:1.44,volume:22.8,relVolume:1.19,rsi:58.7,marketCap:"$2.14T",signal:"Momentum",sector:"Technology"},
    {symbol:"META",name:"Meta Platforms",price:503.45,changePercent:3.21,volume:22.1,relVolume:1.40,rsi:68.1,marketCap:"$1.28T",signal:"Momentum",sector:"Technology"},
    {symbol:"NFLX",name:"Netflix Inc",price:628.14,changePercent:2.84,volume:8.2,relVolume:1.31,rsi:63.4,marketCap:"$270.2B",signal:"Momentum",sector:"Consumer"},
  ],
  gap: [
    {symbol:"OKLO",name:"Oklo Inc",price:22.18,changePercent:18.44,volume:42.8,relVolume:6.22,rsi:84.1,marketCap:"$3.8B",signal:"Strong Breakout",sector:"Energy"},
    {symbol:"RKLB",name:"Rocket Lab USA",price:8.94,changePercent:14.22,volume:38.4,relVolume:5.44,rsi:81.8,marketCap:"$4.1B",signal:"Strong Breakout",sector:"Aerospace"},
    {symbol:"IONQ",name:"IonQ Inc",price:12.42,changePercent:11.88,volume:22.1,relVolume:4.18,rsi:79.2,marketCap:"$2.8B",signal:"Strong Breakout",sector:"Technology"},
    {symbol:"PATH",name:"UiPath",price:14.82,changePercent:9.44,volume:18.9,relVolume:3.82,rsi:76.4,marketCap:"$8.4B",signal:"Breakout",sector:"Technology"},
    {symbol:"APPS",name:"Digital Turbine",price:2.84,changePercent:8.12,volume:14.2,relVolume:3.21,rsi:74.1,marketCap:"$0.4B",signal:"Breakout",sector:"Technology"},
    {symbol:"DJT",name:"Trump Media & Technology",price:38.44,changePercent:-7.82,volume:28.4,relVolume:2.88,rsi:28.4,marketCap:"$6.1B",signal:"Consolidation",sector:"Media"},
    {symbol:"RIVN",name:"Rivian Automotive",price:11.22,changePercent:-6.54,volume:44.1,relVolume:2.44,rsi:31.2,marketCap:"$11.8B",signal:"Consolidation",sector:"Consumer"},
    {symbol:"LCID",name:"Lucid Group",price:2.88,changePercent:-5.44,volume:52.8,relVolume:2.12,rsi:34.8,marketCap:"$6.4B",signal:"Consolidation",sector:"Consumer"},
    {symbol:"BYND",name:"Beyond Meat",price:7.44,changePercent:-4.22,volume:8.8,relVolume:1.98,rsi:38.1,marketCap:"$0.5B",signal:"Neutral",sector:"Consumer"},
    {symbol:"PARA",name:"Paramount Global",price:10.88,changePercent:-3.12,volume:22.4,relVolume:1.82,rsi:42.3,marketCap:"$6.8B",signal:"Neutral",sector:"Media"},
  ],
};

function buildSimulated(tab: string): { symbol:string; name:string; price:number; changePercent:number; volume:number; relVolume:number; rsi:number; marketCap:string; signal:string; sector:string; sparkline:number[] }[] {
  const seed = Math.floor(Date.now() / 60000) % 100;
  return (SIM[tab] ?? SIM.momentum).map((item, idx) => {
    const noise = ((seed * 31 + idx * 7) * 9301 % 233280) / 233280;
    return { ...item, price: parseFloat((item.price * (1 + (noise - 0.5) * 0.02)).toFixed(2)), sparkline: syntheticSparkline(item.price, item.changePercent) };
  });
}

// ── Real data pipeline ─────────────────────────────────────────────────────────
async function buildFromReal(tab: string) {
  const symbols = WATCHLISTS[tab] ?? WATCHLISTS.momentum;

  // Try Yahoo Finance v8 chart for all symbols in parallel (no crumb needed)
  const v8Results = await Promise.allSettled(symbols.map((sym) => fetchYahooV8(sym)));

  const v8Map: Record<string, Awaited<ReturnType<typeof fetchYahooV8>>> = {};
  let yahooHits = 0;
  v8Results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      v8Map[symbols[i]] = r.value;
      yahooHits++;
    }
  });

  // If Yahoo v8 returned fewer than half the symbols, fall back to Twelve Data
  let tdMap: Record<string, TwelveQuote> = {};
  if (yahooHits < symbols.length / 2) {
    tdMap = await fetchTwelveDataQuotes(symbols);
  }

  // Need at least some data to proceed
  if (yahooHits === 0 && Object.keys(tdMap).length === 0) return null;

  // Fetch RSI in parallel (1hr cached)
  const rsiMap: Record<string, number> = {};
  await Promise.allSettled(symbols.map(async (sym) => {
    rsiMap[sym] = await fetchRSI(sym);
  }));

  const results = symbols.map((sym) => {
    const v8 = v8Map[sym];
    const td = tdMap[sym];

    let price: number, changePercent: number, volume: number, relVolume: number, marketCap: number, openPrice: number, prevClose: number, name: string, sparkline: number[];

    if (v8) {
      ({ price, changePercent, volume, relVolume, marketCap, openPrice, prevClose, name, sparkline } = v8);
    } else if (td?.close && td.status !== "error") {
      price = parseFloat(td.close);
      changePercent = parseFloat(td.percent_change ?? "0");
      volume = parseFloat(((parseFloat(td.volume ?? "0")) / 1e6).toFixed(1));
      const avgVol = parseFloat(td.average_volume ?? "0");
      relVolume = avgVol > 0 ? parseFloat((parseFloat(td.volume ?? "0") / avgVol).toFixed(2)) : 1;
      marketCap = MKTCAP_FALLBACK[sym] ?? 0;
      openPrice = parseFloat(td.open ?? td.close ?? "0");
      prevClose = parseFloat(td.previous_close ?? td.close ?? "0");
      name = td.name ?? sym;
      sparkline = syntheticSparkline(price, changePercent);
    } else {
      return null;
    }

    if (!price) return null;

    const rsi = rsiMap[sym] ?? (RSI_SEED[sym] ?? 50);
    const gapPct = prevClose > 0
      ? Math.abs((openPrice - prevClose) / prevClose * 100)
      : Math.abs(changePercent);

    return {
      symbol: sym,
      name,
      price,
      changePercent,
      volume,
      relVolume,
      rsi,
      marketCap: fmtMktCap(marketCap),
      signal: deriveSignal(changePercent, relVolume, rsi),
      sector: SECTORS[sym] ?? "Other",
      sparkline: sparkline.length >= 2 ? sparkline : syntheticSparkline(price, changePercent),
      gapPct,
    };
  }).filter(Boolean) as ({ symbol:string; name:string; price:number; changePercent:number; volume:number; relVolume:number; rsi:number; marketCap:string; signal:string; sector:string; sparkline:number[]; gapPct:number })[];

  if (results.length === 0) return null;

  // Sort by tab criteria
  if (tab === "volume") results.sort((a, b) => b.relVolume - a.relVolume);
  else if (tab === "gap") results.sort((a, b) => b.gapPct - a.gapPct);
  else if (tab === "options") results.sort((a, b) => b.volume - a.volume);
  else results.sort((a, b) => b.changePercent - a.changePercent);

  return results.slice(0, 10);
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const tab    = req.nextUrl.searchParams.get("tab")    ?? "momentum";
  const signal = req.nextUrl.searchParams.get("signal") ?? "all";
  const sector = req.nextUrl.searchParams.get("sector") ?? "all";

  let results: ReturnType<typeof buildSimulated>;
  let usingReal = false;
  let dataSource = "Simulated";

  try {
    const real = await buildFromReal(tab);
    if (real && real.length > 0) {
      results = real;
      usingReal = true;
      dataSource = "Yahoo Finance + Twelve Data";
    } else {
      results = buildSimulated(tab);
    }
  } catch {
    results = buildSimulated(tab);
  }

  const filtered = results.filter((r) => {
    if (signal !== "all" && r.signal !== signal) return false;
    if (sector !== "all" && r.sector !== sector) return false;
    return true;
  });

  const sectors = Array.from(new Set(results.map((r) => r.sector))).sort();

  return NextResponse.json({
    results: filtered,
    sectors,
    usingReal,
    dataSource,
    lastUpdated: new Date().toISOString(),
  });
}
