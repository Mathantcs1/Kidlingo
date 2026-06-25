import { toDecimal } from "./utils";

export function calculatePnl(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  commission = 0,
  tradeType: "EQUITY" | "OPTIONS" = "EQUITY"
): number {
  const dirMultiplier = direction === "LONG" ? 1 : -1;
  const contractMultiplier = tradeType === "OPTIONS" ? 100 : 1;
  return dirMultiplier * (exitPrice - entryPrice) * quantity * contractMultiplier - commission;
}

export function calculateRMultiple(
  pnl: number,
  entryPrice: number,
  stopLoss: number,
  quantity: number,
  tradeType: "EQUITY" | "OPTIONS" = "EQUITY"
): number | null {
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  if (riskPerUnit === 0 || quantity === 0) return null;
  const contractMultiplier = tradeType === "OPTIONS" ? 100 : 1;
  const riskAmount = riskPerUnit * quantity * contractMultiplier;
  return pnl / riskAmount;
}

export function calculateWinRate(
  trades: { pnl: unknown; status: string }[]
): number {
  const closed = trades.filter((t) => t.status === "CLOSED");
  if (closed.length === 0) return 0;
  const wins = closed.filter((t) => toDecimal(t.pnl) > 0).length;
  return (wins / closed.length) * 100;
}

export function calculateProfitFactor(
  trades: { pnl: unknown; status: string }[]
): number {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const grossProfit = closed
    .filter((t) => toDecimal(t.pnl) > 0)
    .reduce((sum, t) => sum + toDecimal(t.pnl), 0);
  const grossLoss = Math.abs(
    closed
      .filter((t) => toDecimal(t.pnl) < 0)
      .reduce((sum, t) => sum + toDecimal(t.pnl), 0)
  );
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

export function buildEquityCurve(
  trades: { pnl: unknown; entryDate: Date | string }[]
): { date: string; equity: number; tradeCount: number }[] {
  const sorted = [...trades]
    .filter((t) => toDecimal(t.pnl) !== 0)
    .sort(
      (a, b) =>
        new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
    );

  let cumulative = 0;
  return sorted.map((t, i) => {
    cumulative += toDecimal(t.pnl);
    return {
      date: new Date(t.entryDate).toISOString().split("T")[0],
      equity: Math.round(cumulative * 100) / 100,
      tradeCount: i + 1,
    };
  });
}

export function calculateMaxDrawdown(equityCurve: { equity: number }[]): number {
  if (equityCurve.length === 0) return 0;
  let peak = -Infinity;
  let maxDD = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function calculateAverageRR(
  trades: { rMultiple: unknown }[]
): number {
  const valid = trades
    .map((t) => toDecimal(t.rMultiple))
    .filter((r) => r !== 0 && !isNaN(r));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, r) => sum + r, 0) / valid.length;
}

export function calculateSharpeRatio(
  dailyReturns: number[],
  riskFreeRate = 0
): number {
  if (dailyReturns.length === 0) return 0;
  const avg =
    dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) /
    dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return ((avg - riskFreeRate) / stdDev) * Math.sqrt(252);
}

export function groupByDay(
  trades: { pnl: unknown; entryDate: Date | string; status: string }[]
): Record<string, { pnl: number; trades: number }> {
  const result: Record<string, { pnl: number; trades: number }> = {};
  for (const t of trades) {
    if (t.status !== "CLOSED") continue;
    const day = new Date(t.entryDate).toISOString().split("T")[0];
    if (!result[day]) result[day] = { pnl: 0, trades: 0 };
    result[day].pnl += toDecimal(t.pnl);
    result[day].trades++;
  }
  return result;
}

export function groupByField<T extends { pnl: unknown; status: string }>(
  trades: T[],
  field: keyof T
): Record<string, { totalPnl: number; trades: number; winRate: number; wins: number; losses: number }> {
  const result: Record<
    string,
    { totalPnl: number; trades: number; winRate: number; wins: number; losses: number }
  > = {};
  const closed = trades.filter((t) => t.status === "CLOSED");
  for (const t of closed) {
    const key = String(t[field] ?? "Unknown");
    if (!result[key]) result[key] = { totalPnl: 0, trades: 0, winRate: 0, wins: 0, losses: 0 };
    result[key].totalPnl += toDecimal(t.pnl);
    result[key].trades++;
    if (toDecimal(t.pnl) > 0) result[key].wins++;
    else result[key].losses++;
  }
  for (const key of Object.keys(result)) {
    const g = result[key];
    g.winRate = g.trades > 0 ? (g.wins / g.trades) * 100 : 0;
  }
  return result;
}

export function getDailyPnl(
  trades: { pnl: unknown; entryDate: Date | string; status: string }[]
): { date: string; pnl: number; trades: number }[] {
  const byDay = groupByDay(trades);
  return Object.entries(byDay)
    .map(([date, data]) => ({ date, pnl: Math.round(data.pnl * 100) / 100, trades: data.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDashboardStats(trades: {
  pnl: unknown;
  status: string;
  rMultiple: unknown;
  entryDate: Date | string;
}[]) {
  const totalPnl = trades
    .filter((t) => t.status === "CLOSED")
    .reduce((sum, t) => sum + toDecimal(t.pnl), 0);
  const winRate = calculateWinRate(trades);
  const profitFactor = calculateProfitFactor(trades);
  const avgRR = calculateAverageRR(trades);
  const equityCurve = buildEquityCurve(trades);
  const maxDrawdown = calculateMaxDrawdown(equityCurve);
  const totalTrades = trades.filter((t) => t.status === "CLOSED").length;
  const openTrades = trades.filter((t) => t.status === "OPEN").length;

  const dailyReturns = getDailyPnl(trades).map((d) => d.pnl);
  const sharpeRatio = calculateSharpeRatio(dailyReturns);

  return {
    totalPnl: Math.round(totalPnl * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgRR: Math.round(avgRR * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10) / 10,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    totalTrades,
    openTrades,
  };
}
