import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Activity, BarChart3, ShieldAlert } from "lucide-react";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { DashboardStats } from "@/types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      title: "Total P&L",
      value: formatCurrency(stats.totalPnl),
      icon: stats.totalPnl >= 0 ? TrendingUp : TrendingDown,
      color: stats.totalPnl >= 0 ? "text-emerald-500" : "text-red-500",
      sub: `${stats.totalTrades} closed trades`,
    },
    {
      title: "Win Rate",
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Target,
      color: stats.winRate >= 50 ? "text-emerald-500" : "text-amber-500",
      sub: `${stats.openTrades} open trades`,
    },
    {
      title: "Profit Factor",
      value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞",
      icon: BarChart3,
      color: stats.profitFactor >= 1.5 ? "text-emerald-500" : stats.profitFactor >= 1 ? "text-amber-500" : "text-red-500",
      sub: "Gross profit / gross loss",
    },
    {
      title: "Avg R:R",
      value: stats.avgRR.toFixed(2) + "R",
      icon: Activity,
      color: stats.avgRR >= 1 ? "text-emerald-500" : "text-amber-500",
      sub: "Average R-multiple",
    },
    {
      title: "Max Drawdown",
      value: `${stats.maxDrawdown.toFixed(1)}%`,
      icon: ShieldAlert,
      color: stats.maxDrawdown <= 10 ? "text-emerald-500" : stats.maxDrawdown <= 20 ? "text-amber-500" : "text-red-500",
      sub: "Peak to trough",
    },
    {
      title: "Sharpe Ratio",
      value: stats.sharpeRatio.toFixed(2),
      icon: TrendingUp,
      color: stats.sharpeRatio >= 1 ? "text-emerald-500" : "text-amber-500",
      sub: "Risk-adjusted return",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={cn("h-4 w-4", card.color)} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={cn("text-xl font-bold", card.color)}>{card.value}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
