"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Activity, BarChart3, ShieldAlert } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { DashboardStats } from "@/types";

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isFinite(value)) return;
    const duration = 700;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(isFinite(value) ? display : value)}</>;
}

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      title: "Total P&L",
      raw: stats.totalPnl,
      format: (n: number) => formatCurrency(n),
      icon: stats.totalPnl >= 0 ? TrendingUp : TrendingDown,
      color: stats.totalPnl >= 0 ? "text-emerald-500" : "text-red-500",
      sub: `${stats.totalTrades} closed trades`,
    },
    {
      title: "Win Rate",
      raw: stats.winRate,
      format: (n: number) => `${n.toFixed(1)}%`,
      icon: Target,
      color: stats.winRate >= 50 ? "text-emerald-500" : "text-amber-500",
      sub: `${stats.openTrades} open trades`,
    },
    {
      title: "Profit Factor",
      raw: stats.profitFactor,
      format: (n: number) => (isFinite(n) ? n.toFixed(2) : "∞"),
      icon: BarChart3,
      color: stats.profitFactor >= 1.5 ? "text-emerald-500" : stats.profitFactor >= 1 ? "text-amber-500" : "text-red-500",
      sub: "Gross profit / gross loss",
    },
    {
      title: "Avg R:R",
      raw: stats.avgRR,
      format: (n: number) => `${n.toFixed(2)}R`,
      icon: Activity,
      color: stats.avgRR >= 1 ? "text-emerald-500" : "text-amber-500",
      sub: "Average R-multiple",
    },
    {
      title: "Max Drawdown",
      raw: stats.maxDrawdown,
      format: (n: number) => `${n.toFixed(1)}%`,
      icon: ShieldAlert,
      color: stats.maxDrawdown <= 10 ? "text-emerald-500" : stats.maxDrawdown <= 20 ? "text-amber-500" : "text-red-500",
      sub: "Peak to trough",
    },
    {
      title: "Sharpe Ratio",
      raw: stats.sharpeRatio,
      format: (n: number) => n.toFixed(2),
      icon: TrendingUp,
      color: stats.sharpeRatio >= 1 ? "text-emerald-500" : "text-amber-500",
      sub: "Risk-adjusted return",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-muted-foreground/30"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={cn("h-4 w-4", card.color)} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={cn("text-xl font-bold tabular-nums", card.color)}>
              <AnimatedNumber value={card.raw} format={card.format} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
