import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { buildDashboardStats, buildEquityCurve, getDailyPnl, groupByField, groupByDay } from "@/lib/calculations";
import { toDecimal } from "@/lib/utils";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { EquityCurve } from "@/components/dashboard/equity-curve";
import { DailyPnlChart } from "@/components/dashboard/daily-pnl-chart";
import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { InstrumentDonut } from "@/components/dashboard/instrument-donut";
import { BestWorstTrades } from "@/components/dashboard/best-worst-trades";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { account } = await searchParams;
  const where: Record<string, unknown> = { userId: session.user.id };
  if (account) where.tradingAccountId = account;

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { entryDate: "asc" },
    select: {
      id: true, instrument: true, direction: true, pnl: true, rMultiple: true,
      entryDate: true, exitDate: true, status: true,
    },
  });

  const serialized = trades.map((t) => ({
    ...t,
    pnl: toDecimal(t.pnl),
    rMultiple: toDecimal(t.rMultiple),
  }));

  const stats = buildDashboardStats(serialized);
  const equityCurve = buildEquityCurve(serialized);
  const dailyPnl = getDailyPnl(serialized);
  const byInstrument = groupByField(serialized, "instrument");
  const heatmapData = groupByDay(serialized);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Your trading performance overview</p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <EquityCurve data={equityCurve} />
        </div>
        <InstrumentDonut data={byInstrument} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DailyPnlChart data={dailyPnl} />
        <CalendarHeatmap data={heatmapData} />
      </div>

      <BestWorstTrades trades={serialized} />
    </div>
  );
}
