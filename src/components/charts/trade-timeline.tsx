"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Scatter, Line } from "recharts";
import { formatCurrency, toDecimal } from "@/lib/utils";

interface TradeTimelineProps {
  trade: {
    entryPrice: unknown;
    exitPrice: unknown;
    stopLoss: unknown;
    takeProfit: unknown;
    direction: string;
    pnl: unknown;
  };
}

export function TradeTimeline({ trade }: TradeTimelineProps) {
  const entry = toDecimal(trade.entryPrice);
  const exit = trade.exitPrice ? toDecimal(trade.exitPrice) : null;
  const sl = trade.stopLoss ? toDecimal(trade.stopLoss) : null;
  const tp = trade.takeProfit ? toDecimal(trade.takeProfit) : null;
  const pnl = trade.pnl ? toDecimal(trade.pnl) : null;

  const prices = [entry, exit, sl, tp].filter(Boolean) as number[];
  const minP = Math.min(...prices) * 0.999;
  const maxP = Math.max(...prices) * 1.001;

  const data = [
    { x: 0, price: entry },
    ...(exit ? [{ x: 1, price: exit }] : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Trade Chart — {trade.direction === "LONG" ? "🟢 Long" : "🔴 Short"}
          {pnl !== null && (
            <span className={`ml-2 text-sm ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatCurrency(pnl)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="x" tickFormatter={(v) => v === 0 ? "Entry" : "Exit"}
              tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={[minP, maxP]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `$${v.toFixed(2)}`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: "12px", borderRadius: "6px" }}
              formatter={(v: number) => [`$${v.toFixed(4)}`, "Price"]}
            />
            {sl && <ReferenceLine y={sl} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `SL $${sl.toFixed(2)}`, position: "right", fontSize: 10, fill: "#ef4444" }} />}
            {tp && <ReferenceLine y={tp} stroke="#10b981" strokeDasharray="4 4" label={{ value: `TP $${tp.toFixed(2)}`, position: "right", fontSize: 10, fill: "#10b981" }} />}
            <ReferenceLine y={entry} stroke="#3b82f6" strokeDasharray="2 2" label={{ value: `Entry $${entry.toFixed(2)}`, position: "right", fontSize: 10, fill: "#3b82f6" }} />
            <Line type="linear" dataKey="price" stroke={pnl !== null && pnl >= 0 ? "#10b981" : "#ef4444"} strokeWidth={2} dot={{ r: 5, fill: "#3b82f6" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
