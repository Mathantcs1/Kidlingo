import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScannerResult {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  relVolume: number;
  rsi: number;
  marketCap: string;
  signal: string;
  sector: string;
  sparkline: number[];
}

interface PolygonTicker {
  ticker: string;
  todaysChangePerc: number;
  day: { o: number; h: number; l: number; c: number; v: number };
  prevDay: { c: number; v: number };
}

// ── Lookup tables (Polygon snapshot lacks name/sector/mktCap) ─────────────────
const NAMES: Record<string, string> = {
  AAPL:"Apple Inc",MSFT:"Microsoft Corp",NVDA:"NVIDIA Corp",TSLA:"Tesla Inc",
  AMZN:"Amazon.com",META:"Meta Platforms",GOOGL:"Alphabet Inc",GOOG:"Alphabet Inc",
  AMD:"Advanced Micro Devices",COIN:"Coinbase Global",PLTR:"Palantir Technologies",
  SOFI:"SoFi Technologies",MSTR:"MicroStrategy",GME:"GameStop",AMC:"AMC Entertainment",
  MARA:"Marathon Digital",RIOT:"Riot Platforms",BBAI:"BigBear.ai",SPCE:"Virgin Galactic",
  SOUN:"SoundHound AI",CLSK:"CleanSpark",HUT:"Hut 8 Mining",SMCI:"Super Micro Computer",
  NFLX:"Netflix Inc",MSTZ:"Meta Short ETF",OKLO:"Oklo Inc",RKLB:"Rocket Lab USA",
  IONQ:"IonQ Inc",PATH:"UiPath",RIVN:"Rivian Automotive",LCID:"Lucid Group",
  SPY:"SPDR S&P 500 ETF",QQQ:"Invesco QQQ ETF",IWM:"iShares Russell 2000",
  DJT:"Trump Media & Technology",BYND:"Beyond Meat",PARA:"Paramount Global",
  APPS:"Digital Turbine",INTC:"Intel Corp",SNAP:"Snap Inc",UBER:"Uber Technologies",
  LYFT:"Lyft Inc",ROKU:"Roku Inc",PYPL:"PayPal Holdings",SQ:"Block Inc",
  HOOD:"Robinhood Markets",DKNG:"DraftKings",PENN:"PENN Entertainment",
};

const SECTORS: Record<string, string> = {
  AAPL:"Technology",MSFT:"Technology",NVDA:"Technology",TSLA:"Consumer",
  AMZN:"Consumer",META:"Technology",GOOGL:"Technology",GOOG:"Technology",
  AMD:"Technology",COIN:"Financials",PLTR:"Technology",SOFI:"Financials",
  MSTR:"Technology",GME:"Consumer",AMC:"Consumer",MARA:"Technology",
  RIOT:"Technology",BBAI:"Technology",SPCE:"Aerospace",SOUN:"Technology",
  CLSK:"Energy",HUT:"Technology",SMCI:"Technology",NFLX:"Consumer",
  OKLO:"Energy",RKLB:"Aerospace",IONQ:"Technology",PATH:"Technology",
  RIVN:"Consumer",LCID:"Consumer",SPY:"ETF",QQQ:"ETF",IWM:"ETF",
  DJT:"Media",BYND:"Consumer",PARA:"Media",APPS:"Technology",
  INTC:"Technology",SNAP:"Technology",UBER:"Consumer",LYFT:"Consumer",
  ROKU:"Technology",PYPL:"Financials",SQ:"Financials",HOOD:"Financials",
  DKNG:"Consumer",PENN:"Consumer",
};

const MCAP: Record<string, string> = {
  AAPL:"2.94T",MSFT:"3.08T",NVDA:"2.19T",TSLA:"558B",AMZN:"1.88T",
  META:"1.28T",GOOGL:"2.14T",AMD:"261B",COIN:"57.8B",PLTR:"53.4B",
  SOFI:"9.1B",MSTR:"23.2B",GME:"5.2B",AMC:"1.8B",MARA:"4.8B",
  RIOT:"3.1B",BBAI:"0.8B",SPCE:"0.6B",SOUN:"2.7B",CLSK:"2.9B",
  HUT:"1.5B",SMCI:"49.8B",NFLX:"270B",OKLO:"3.8B",RKLB:"4.1B",
  IONQ:"2.8B",PATH:"8.4B",RIVN:"11.8B",LCID:"6.4B",SPY:"500B",
  QQQ:"250B",DJT:"6.1B",BYND:"0.5B",PARA:"6.8B",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function deriveSignal(chg: number, relVol: number): string {
  if (chg > 6 && relVol > 1.7) return "Strong Breakout";
  if (chg > 3 && relVol > 1.4) return "Breakout";
  if (chg > 1 && relVol > 1.1) return "Momentum";
  if (chg >= -1) return "Consolidation";
  return "Neutral";
}

function makeSparkline(price: number, trend: number): number[] {
  const pts: number[] = [];
  let p = price * (1 - Math.abs(trend) * 0.006);
  for (let i = 0; i < 7; i++) {
    p *= 1 + (trend > 0 ? 0.003 : -0.003) + (Math.random() * 0.004 - 0.002);
    pts.push(parseFloat(p.toFixed(2)));
  }
  return pts;
}

function addNoise(v: number, seed: number, f = 0.02) {
  const r = ((seed * 9301 + 49297) % 233280) / 233280;
  return parseFloat((v * (1 + (r - 0.5) * 2 * f)).toFixed(2));
}

function toResult(t: PolygonTicker, rsi: number): ScannerResult {
  const relVol = t.prevDay?.v > 0 ? parseFloat((t.day.v / t.prevDay.v).toFixed(2)) : 1;
  const chg = parseFloat((t.todaysChangePerc ?? 0).toFixed(2));
  return {
    symbol: t.ticker,
    name: NAMES[t.ticker] ?? t.ticker,
    price: parseFloat((t.day?.c ?? 0).toFixed(2)),
    changePercent: chg,
    volume: parseFloat(((t.day?.v ?? 0) / 1e6).toFixed(1)),
    relVolume: relVol,
    rsi: parseFloat(rsi.toFixed(1)),
    marketCap: MCAP[t.ticker] ?? "—",
    signal: deriveSignal(chg, relVol),
    sector: SECTORS[t.ticker] ?? "Other",
    sparkline: makeSparkline(t.day?.c ?? 100, chg),
  };
}

// ── Polygon fetch helpers ──────────────────────────────────────────────────────
async function polygonGet(path: string, apiKey: string, ttl = 120) {
  const url = `https://api.polygon.io${path}${path.includes("?") ? "&" : "?"}apiKey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: ttl } });
  if (!res.ok) throw new Error(`Polygon ${res.status} ${path}`);
  return res.json();
}

async function getRSI(ticker: string, apiKey: string): Promise<number> {
  try {
    const data = await polygonGet(
      `/v1/indicators/rsi/${ticker}?timespan=day&window=14&limit=1`,
      apiKey, 300
    );
    return data.results?.values?.[0]?.value ?? 50;
  } catch {
    return 50;
  }
}

async function fetchPolygonGainers(apiKey: string): Promise<PolygonTicker[]> {
  const data = await polygonGet("/v2/snapshot/locale/us/markets/stocks/gainers", apiKey);
  return data.tickers ?? [];
}

async function fetchPolygonLosers(apiKey: string): Promise<PolygonTicker[]> {
  const data = await polygonGet("/v2/snapshot/locale/us/markets/stocks/losers", apiKey);
  return data.tickers ?? [];
}

async function fetchPolygonSnapshot(tickers: string[], apiKey: string): Promise<PolygonTicker[]> {
  const data = await polygonGet(
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(",")}`,
    apiKey
  );
  return data.tickers ?? [];
}

// ── Real-data pipeline ─────────────────────────────────────────────────────────
async function buildFromPolygon(tab: string, apiKey: string): Promise<ScannerResult[]> {
  let rawTickers: PolygonTicker[];

  if (tab === "momentum") {
    rawTickers = (await fetchPolygonGainers(apiKey)).slice(0, 10);
  } else if (tab === "volume") {
    const gainers = await fetchPolygonGainers(apiKey);
    rawTickers = gainers
      .filter((t) => t.prevDay?.v > 0)
      .sort((a, b) => (b.day.v / b.prevDay.v) - (a.day.v / a.prevDay.v))
      .slice(0, 10);
  } else if (tab === "options") {
    const optionsTickers = ["NVDA","TSLA","AAPL","AMD","META","AMZN","MSFT","GOOGL","NFLX","COIN"];
    rawTickers = await fetchPolygonSnapshot(optionsTickers, apiKey);
  } else {
    // gap: gainers + losers, filter by gap between today's open and yesterday's close
    const [gainers, losers] = await Promise.all([
      fetchPolygonGainers(apiKey),
      fetchPolygonLosers(apiKey),
    ]);
    const combined = [...gainers, ...losers].filter(
      (t) => t.prevDay?.c > 0 && Math.abs((t.day.o - t.prevDay.c) / t.prevDay.c) > 0.01
    );
    combined.sort(
      (a, b) => Math.abs(b.todaysChangePerc) - Math.abs(a.todaysChangePerc)
    );
    rawTickers = combined.slice(0, 10);
  }

  // Fetch RSI in parallel for all tickers (each cached for 5 min)
  const rsiValues = await Promise.allSettled(
    rawTickers.map((t) => getRSI(t.ticker, apiKey))
  );

  return rawTickers.map((t, i) => {
    const rsi = rsiValues[i].status === "fulfilled" ? rsiValues[i].value : 50;
    return toResult(t, rsi);
  });
}

// ── Simulated fallback (unchanged from before) ─────────────────────────────────
const SIM_DATASETS: Record<string, Omit<ScannerResult, "sparkline">[]> = {
  momentum: [
    { symbol:"SOFI", name:"SoFi Technologies", price:9.42, changePercent:8.91, volume:95.1, relVolume:1.97, rsi:78.2, marketCap:"9.1B", signal:"Strong Breakout", sector:"Financials" },
    { symbol:"MSTR", name:"MicroStrategy", price:1342.10, changePercent:7.84, volume:4.2, relVolume:1.50, rsi:76.1, marketCap:"23.2B", signal:"Strong Breakout", sector:"Technology" },
    { symbol:"PLTR", name:"Palantir Technologies", price:24.87, changePercent:6.54, volume:82.4, relVolume:1.82, rsi:74.8, marketCap:"53.4B", signal:"Breakout", sector:"Technology" },
    { symbol:"COIN", name:"Coinbase Global", price:228.90, changePercent:5.22, volume:18.9, relVolume:1.66, rsi:71.5, marketCap:"57.8B", signal:"Breakout", sector:"Financials" },
    { symbol:"NVDA", name:"NVIDIA Corp", price:891.20, changePercent:4.82, volume:48.2, relVolume:1.55, rsi:72.4, marketCap:"2.19T", signal:"Breakout", sector:"Technology" },
    { symbol:"AMD", name:"Advanced Micro Devices", price:162.55, changePercent:3.45, volume:58.7, relVolume:1.39, rsi:66.8, marketCap:"261.8B", signal:"Momentum", sector:"Technology" },
    { symbol:"META", name:"Meta Platforms", price:503.45, changePercent:3.21, volume:22.1, relVolume:1.40, rsi:68.1, marketCap:"1.28T", signal:"Momentum", sector:"Technology" },
    { symbol:"AMZN", name:"Amazon.com", price:182.34, changePercent:2.18, volume:31.5, relVolume:1.43, rsi:65.3, marketCap:"1.88T", signal:"Momentum", sector:"Consumer" },
    { symbol:"TSLA", name:"Tesla Inc", price:175.22, changePercent:1.94, volume:102.3, relVolume:1.21, rsi:58.2, marketCap:"558.1B", signal:"Consolidation", sector:"Consumer" },
    { symbol:"AAPL", name:"Apple Inc", price:191.45, changePercent:0.87, volume:42.1, relVolume:1.10, rsi:54.1, marketCap:"2.94T", signal:"Neutral", sector:"Technology" },
  ],
  volume: [
    { symbol:"GME", name:"GameStop", price:14.82, changePercent:12.44, volume:184.2, relVolume:4.21, rsi:81.3, marketCap:"5.2B", signal:"Strong Breakout", sector:"Consumer" },
    { symbol:"AMC", name:"AMC Entertainment", price:4.18, changePercent:9.87, volume:142.6, relVolume:3.88, rsi:79.4, marketCap:"1.8B", signal:"Strong Breakout", sector:"Consumer" },
    { symbol:"MARA", name:"Marathon Digital", price:21.34, changePercent:8.12, volume:68.4, relVolume:3.22, rsi:77.1, marketCap:"4.8B", signal:"Breakout", sector:"Technology" },
    { symbol:"RIOT", name:"Riot Platforms", price:12.78, changePercent:7.55, volume:54.8, relVolume:2.95, rsi:74.6, marketCap:"3.1B", signal:"Breakout", sector:"Technology" },
    { symbol:"BBAI", name:"BigBear.ai", price:3.24, changePercent:15.32, volume:38.2, relVolume:5.14, rsi:83.2, marketCap:"0.8B", signal:"Strong Breakout", sector:"Technology" },
    { symbol:"SPCE", name:"Virgin Galactic", price:2.15, changePercent:11.98, volume:92.1, relVolume:4.67, rsi:80.4, marketCap:"0.6B", signal:"Strong Breakout", sector:"Aerospace" },
    { symbol:"SOUN", name:"SoundHound AI", price:7.82, changePercent:6.44, volume:45.3, relVolume:2.78, rsi:71.2, marketCap:"2.7B", signal:"Breakout", sector:"Technology" },
    { symbol:"CLSK", name:"CleanSpark", price:18.94, changePercent:5.88, volume:29.7, relVolume:2.41, rsi:68.9, marketCap:"2.9B", signal:"Momentum", sector:"Energy" },
    { symbol:"HUT", name:"Hut 8 Mining", price:11.22, changePercent:4.33, volume:22.4, relVolume:2.12, rsi:65.4, marketCap:"1.5B", signal:"Momentum", sector:"Technology" },
    { symbol:"SMCI", name:"Super Micro Computer", price:848.10, changePercent:3.21, volume:8.9, relVolume:1.88, rsi:62.3, marketCap:"49.8B", signal:"Momentum", sector:"Technology" },
  ],
  options: [
    { symbol:"NVDA", name:"NVIDIA Corp", price:891.20, changePercent:4.82, volume:48.2, relVolume:1.55, rsi:72.4, marketCap:"2.19T", signal:"Breakout", sector:"Technology" },
    { symbol:"TSLA", name:"Tesla Inc", price:175.22, changePercent:1.94, volume:102.3, relVolume:1.21, rsi:58.2, marketCap:"558.1B", signal:"Momentum", sector:"Consumer" },
    { symbol:"AAPL", name:"Apple Inc", price:191.45, changePercent:0.87, volume:42.1, relVolume:1.10, rsi:54.1, marketCap:"2.94T", signal:"Neutral", sector:"Technology" },
    { symbol:"SPY", name:"SPDR S&P 500 ETF", price:524.88, changePercent:0.54, volume:68.2, relVolume:0.92, rsi:51.3, marketCap:"500B", signal:"Neutral", sector:"ETF" },
    { symbol:"QQQ", name:"Invesco QQQ ETF", price:447.22, changePercent:0.88, volume:34.1, relVolume:0.98, rsi:53.8, marketCap:"250B", signal:"Neutral", sector:"ETF" },
    { symbol:"MSFT", name:"Microsoft Corp", price:414.32, changePercent:1.22, volume:18.4, relVolume:1.12, rsi:55.2, marketCap:"3.08T", signal:"Momentum", sector:"Technology" },
    { symbol:"AMZN", name:"Amazon.com", price:182.34, changePercent:2.18, volume:31.5, relVolume:1.43, rsi:65.3, marketCap:"1.88T", signal:"Momentum", sector:"Consumer" },
    { symbol:"GOOGL", name:"Alphabet Inc", price:171.96, changePercent:1.44, volume:22.8, relVolume:1.19, rsi:58.7, marketCap:"2.14T", signal:"Momentum", sector:"Technology" },
    { symbol:"META", name:"Meta Platforms", price:503.45, changePercent:3.21, volume:22.1, relVolume:1.40, rsi:68.1, marketCap:"1.28T", signal:"Momentum", sector:"Technology" },
    { symbol:"NFLX", name:"Netflix Inc", price:628.14, changePercent:2.84, volume:8.2, relVolume:1.31, rsi:63.4, marketCap:"270.2B", signal:"Momentum", sector:"Consumer" },
  ],
  gap: [
    { symbol:"OKLO", name:"Oklo Inc", price:22.18, changePercent:18.44, volume:42.8, relVolume:6.22, rsi:84.1, marketCap:"3.8B", signal:"Strong Breakout", sector:"Energy" },
    { symbol:"RKLB", name:"Rocket Lab USA", price:8.94, changePercent:14.22, volume:38.4, relVolume:5.44, rsi:81.8, marketCap:"4.1B", signal:"Strong Breakout", sector:"Aerospace" },
    { symbol:"IONQ", name:"IonQ Inc", price:12.42, changePercent:11.88, volume:22.1, relVolume:4.18, rsi:79.2, marketCap:"2.8B", signal:"Strong Breakout", sector:"Technology" },
    { symbol:"PATH", name:"UiPath", price:14.82, changePercent:9.44, volume:18.9, relVolume:3.82, rsi:76.4, marketCap:"8.4B", signal:"Breakout", sector:"Technology" },
    { symbol:"APPS", name:"Digital Turbine", price:2.84, changePercent:8.12, volume:14.2, relVolume:3.21, rsi:74.1, marketCap:"0.4B", signal:"Breakout", sector:"Technology" },
    { symbol:"DJT", name:"Trump Media & Technology", price:38.44, changePercent:-7.82, volume:28.4, relVolume:2.88, rsi:28.4, marketCap:"6.1B", signal:"Consolidation", sector:"Media" },
    { symbol:"RIVN", name:"Rivian Automotive", price:11.22, changePercent:-6.54, volume:44.1, relVolume:2.44, rsi:31.2, marketCap:"11.8B", signal:"Consolidation", sector:"Consumer" },
    { symbol:"LCID", name:"Lucid Group", price:2.88, changePercent:-5.44, volume:52.8, relVolume:2.12, rsi:34.8, marketCap:"6.4B", signal:"Consolidation", sector:"Consumer" },
    { symbol:"BYND", name:"Beyond Meat", price:7.44, changePercent:-4.22, volume:8.8, relVolume:1.98, rsi:38.1, marketCap:"0.5B", signal:"Neutral", sector:"Consumer" },
    { symbol:"PARA", name:"Paramount Global", price:10.88, changePercent:-3.12, volume:22.4, relVolume:1.82, rsi:42.3, marketCap:"6.8B", signal:"Neutral", sector:"Media" },
  ],
};

function buildSimulated(tab: string): ScannerResult[] {
  const base = SIM_DATASETS[tab] ?? SIM_DATASETS.momentum;
  const seed = Math.floor(Date.now() / 60000) % 100;
  return base.map((item, idx) => ({
    ...item,
    price: addNoise(item.price, seed * 31 + idx * 7),
    volume: addNoise(item.volume, seed * 31 + idx * 7 + 1),
    sparkline: makeSparkline(item.price, item.changePercent),
  }));
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "momentum";
  const signal = req.nextUrl.searchParams.get("signal") ?? "all";
  const sector = req.nextUrl.searchParams.get("sector") ?? "all";
  const apiKey = process.env.POLYGON_API_KEY;

  let results: ScannerResult[];
  let usingReal = false;

  if (apiKey) {
    try {
      results = await buildFromPolygon(tab, apiKey);
      usingReal = results.length > 0;
    } catch {
      results = buildSimulated(tab);
    }
  } else {
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
    lastUpdated: new Date().toISOString(),
  });
}
