"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

interface InstrumentDonutProps {
  data: Record<string, { totalPnl: number; trades: number }>;
}

export function InstrumentDonut({ data }: InstrumentDonutProps) {
  const chartData = Object.entries(data)
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, 7)
    .map(([name, stats]) => ({ name, trades: stats.trades, pnl: stats.totalPnl }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Trades by Instrument</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
              paddingAngle={2} dataKey="trades">
              {chartData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
              formatter={(value: number, name: string, props) => [
                `${value} trades | ${formatCurrency(props.payload.pnl)}`, props.payload.name
              ]}
            />
            <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
