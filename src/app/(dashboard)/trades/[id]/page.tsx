import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { toDecimal, formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TradeAiAnalysis } from "@/components/ai/trade-analysis";
import { TradeTimeline } from "@/components/charts/trade-timeline";
import { Pencil, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TradeCharts } from "@/components/trades/trade-charts";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ analyze?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const autoAnalyze = sp.analyze === "1";

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { aiAnalyses: { orderBy: { createdAt: "desc" } } },
  });

  if (!trade) notFound();
  if (trade.userId !== session.user.id && session.user.role !== "ADMIN") redirect("/trades");

  const pnl = trade.pnl ? toDecimal(trade.pnl) : null;
  const rr = trade.rMultiple ? toDecimal(trade.rMultiple) : null;

  const serialized = {
    ...trade,
    entryPrice: toDecimal(trade.entryPrice),
    exitPrice: trade.exitPrice ? toDecimal(trade.exitPrice) : null,
    quantity: toDecimal(trade.quantity),
    stopLoss: trade.stopLoss ? toDecimal(trade.stopLoss) : null,
    takeProfit: trade.takeProfit ? toDecimal(trade.takeProfit) : null,
    commission: trade.commission ? toDecimal(trade.commission) : null,
    pnl,
    rMultiple: rr,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/trades"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{trade.instrument}</h1>
              <Badge variant="outline" className={cn("text-xs", trade.direction === "LONG" ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30")}>
                {trade.direction}
              </Badge>
              <Badge variant={trade.status === "CLOSED" ? "secondary" : "outline"} className="text-xs">
                {trade.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">{formatDate(trade.entryDate)}</p>
          </div>
        </div>
        {session.user.role !== "VIEWER" && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/trades/${id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Entry Price", value: `$${serialized.entryPrice.toFixed(4)}` },
          { label: "Exit Price", value: serialized.exitPrice ? `$${serialized.exitPrice.toFixed(4)}` : "Open" },
          { label: "P&L", value: pnl !== null ? formatCurrency(pnl) : "—", color: pnl !== null ? (pnl >= 0 ? "text-emerald-500" : "text-red-500") : "" },
          { label: "R-Multiple", value: rr !== null ? `${rr.toFixed(2)}R` : "—", color: rr !== null ? (rr >= 0 ? "text-emerald-500" : "text-red-500") : "" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-lg font-bold mt-0.5", color)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <TradeTimeline trade={serialized} />

      <TradeCharts entryUrl={trade.screenshotUrl} exitUrl={trade.exitScreenshotUrl} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Trade Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Quantity", serialized.quantity],
              ["Stop Loss", serialized.stopLoss ? `$${serialized.stopLoss.toFixed(4)}` : "—"],
              ["Take Profit", serialized.takeProfit ? `$${serialized.takeProfit.toFixed(4)}` : "—"],
              ["Commission", serialized.commission ? formatCurrency(serialized.commission) : "—"],
              ["Strategy", trade.strategyTag ?? "—"],
              ["Session", trade.sessionType ?? "—"],
              ["Setup", trade.tradeSetup ?? "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Notes & Psychology</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {trade.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{trade.notes}</p>
              </div>
            )}
            {trade.psychology && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Psychology</p>
                <p className="whitespace-pre-wrap">{trade.psychology}</p>
              </div>
            )}
            {!trade.notes && !trade.psychology && (
              <p className="text-muted-foreground">No notes added</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TradeAiAnalysis
        tradeId={trade.id}
        aiProvider={session.user.aiProvider}
        existingAnalysis={trade.aiAnalyses[0] ?? null}
        autoAnalyze={autoAnalyze}
      />
    </div>
  );
}
