import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { groupByField, getDailyPnl, calculateWinRate, calculateProfitFactor, calculateSharpeRatio, buildEquityCurve } from "@/lib/calculations";
import { toDecimal } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const groupBy = searchParams.get("groupBy") ?? "instrument";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const accountId = searchParams.get("account");
  const where: Record<string, unknown> = { userId: session.user.id, status: "CLOSED" };
  if (accountId) where.tradingAccountId = accountId;
  if (dateFrom || dateTo) {
    where.entryDate = {};
    if (dateFrom) (where.entryDate as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.entryDate as Record<string, unknown>).lte = new Date(dateTo);
  }

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { entryDate: "asc" },
    select: {
      id: true,
      instrument: true,
      direction: true,
      strategyTag: true,
      sessionType: true,
      tradeSetup: true,
      psychology: true,
      entryDate: true,
      exitDate: true,
      pnl: true,
      rMultiple: true,
      status: true,
    },
  });

  const serialized = trades.map((t) => ({
    ...t,
    pnl: toDecimal(t.pnl),
    rMultiple: toDecimal(t.rMultiple),
  }));

  let grouped: Record<string, unknown> = {};

  if (groupBy === "instrument") {
    grouped = groupByField(serialized, "instrument");
  } else if (groupBy === "strategy") {
    grouped = groupByField(serialized, "strategyTag");
  } else if (groupBy === "dayOfWeek") {
    const byDow: typeof serialized[] = Array.from({ length: 7 }, () => []);
    serialized.forEach((t) => {
      const dow = new Date(t.entryDate).getDay();
      byDow[dow].push(t);
    });
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    grouped = Object.fromEntries(
      days.map((d, i) => [
        d,
        {
          totalPnl: byDow[i].reduce((sum, t) => sum + t.pnl, 0),
          trades: byDow[i].length,
          winRate: byDow[i].length > 0 ? calculateWinRate(byDow[i]) : 0,
          wins: byDow[i].filter((t) => t.pnl > 0).length,
          losses: byDow[i].filter((t) => t.pnl < 0).length,
        },
      ])
    );
  } else if (groupBy === "hour") {
    const byHour: typeof serialized[] = Array.from({ length: 24 }, () => []);
    serialized.forEach((t) => {
      const hour = new Date(t.entryDate).getHours();
      byHour[hour].push(t);
    });
    grouped = Object.fromEntries(
      Array.from({ length: 24 }, (_, i) => [
        `${String(i).padStart(2, "0")}:00`,
        {
          totalPnl: byHour[i].reduce((sum, t) => sum + t.pnl, 0),
          trades: byHour[i].length,
          winRate: byHour[i].length > 0 ? calculateWinRate(byHour[i]) : 0,
          wins: byHour[i].filter((t) => t.pnl > 0).length,
          losses: byHour[i].filter((t) => t.pnl < 0).length,
        },
      ])
    );
  }

  // Streak analysis
  let currentStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const t of serialized) {
    if (t.pnl > 0) { curWin++; curLoss = 0; longestWinStreak = Math.max(longestWinStreak, curWin); }
    else { curLoss++; curWin = 0; longestLossStreak = Math.max(longestLossStreak, curLoss); }
  }
  if (serialized.length > 0) {
    const last = serialized[serialized.length - 1];
    currentStreak = last.pnl > 0 ? curWin : -curLoss;
  }

  const equityCurve = buildEquityCurve(serialized);
  const dailyReturns = getDailyPnl(serialized).map((d) => d.pnl);
  const sharpeRatio = calculateSharpeRatio(dailyReturns);
  const profitFactor = calculateProfitFactor(serialized);

  return NextResponse.json({
    grouped,
    streak: { current: currentStreak, longestWin: longestWinStreak, longestLoss: longestLossStreak },
    riskMetrics: { sharpeRatio, profitFactor },
    equityCurve,
    totalTrades: trades.length,
  });
}
