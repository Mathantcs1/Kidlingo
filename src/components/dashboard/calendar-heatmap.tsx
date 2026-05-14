"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

interface CalendarHeatmapProps {
  data: Record<string, { pnl: number; trades: number }>;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getPnlColor(pnl: number): string {
  if (pnl === 0) return "bg-muted";
  if (pnl > 500) return "bg-emerald-600";
  if (pnl > 100) return "bg-emerald-500";
  if (pnl > 0) return "bg-emerald-400";
  if (pnl > -100) return "bg-red-400";
  if (pnl > -500) return "bg-red-500";
  return "bg-red-600";
}

export function CalendarHeatmap({ data }: CalendarHeatmapProps) {
  const [displayDate, setDisplayDate] = useState(new Date());
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: (null | { day: number; dateStr: string })[] = [
    ...Array(startPadding).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { day: d, dateStr };
    }),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Monthly Heatmap</CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => setDisplayDate(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground w-20 text-center">
            {firstDay.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => setDisplayDate(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs text-muted-foreground font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, idx) =>
            cell === null ? (
              <div key={idx} />
            ) : (
              <div
                key={cell.dateStr}
                className={cn(
                  "aspect-square rounded-sm flex items-center justify-center relative group cursor-default",
                  data[cell.dateStr] ? getPnlColor(data[cell.dateStr].pnl) : "bg-muted/40"
                )}
                title={data[cell.dateStr]
                  ? `${cell.dateStr}: ${formatCurrency(data[cell.dateStr].pnl)} (${data[cell.dateStr].trades} trades)`
                  : cell.dateStr}
              >
                <span className="text-[9px] text-white/80">{cell.day}</span>
              </div>
            )
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-xs text-muted-foreground">Loss</span>
          {["bg-red-600", "bg-red-400", "bg-muted/40", "bg-emerald-400", "bg-emerald-600"].map((c) => (
            <div key={c} className={cn("h-3 w-3 rounded-sm", c)} />
          ))}
          <span className="text-xs text-muted-foreground">Profit</span>
        </div>
      </CardContent>
    </Card>
  );
}
