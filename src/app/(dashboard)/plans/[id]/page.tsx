import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { toDecimal, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { ConvertPlanButton } from "@/components/plans/convert-plan-button";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  TRIGGERED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const plan = await prisma.tradePlan.findUnique({
    where: { id },
    include: { alerts: { orderBy: { createdAt: "asc" } } },
  });

  if (!plan || plan.userId !== session.user.id) notFound();

  const entry = toDecimal(plan.entryPrice);
  const sl = toDecimal(plan.stopLoss);
  const tp = toDecimal(plan.takeProfit);
  const rr = (tp - entry) / (entry - sl);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/plans"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{plan.instrument}</h1>
          <Badge variant="outline" className={cn("text-xs", plan.direction === "LONG" ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30")}>
            {plan.direction}
          </Badge>
          <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[plan.status])}>
            {plan.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Entry", value: `$${entry.toFixed(2)}`, color: "text-blue-500" },
          { label: "Stop Loss", value: `$${sl.toFixed(2)}`, color: "text-red-500" },
          { label: "Take Profit", value: `$${tp.toFixed(2)}`, color: "text-emerald-500" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-lg font-bold mt-0.5", color)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-3 px-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Date: {formatDate(plan.date)}</span>
          {!isNaN(rr) && rr > 0 && (
            <span className="font-semibold">R:R = {rr.toFixed(2)}R</span>
          )}
        </CardContent>
      </Card>

      {plan.rationale && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Rationale</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{plan.rationale}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" />Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plan.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts for this plan</p>
          ) : (
            <div className="space-y-2">
              {plan.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div>
                    <span className="font-medium">{alert.alertType.replace("_", " ")}</span>
                    <span className="text-muted-foreground ml-2">${toDecimal(alert.targetPrice).toFixed(2)}</span>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", alert.status === "TRIGGERED" ? "text-blue-400 border-blue-500/30" : alert.status === "DISMISSED" ? "text-muted-foreground" : "text-emerald-400 border-emerald-500/30")}>
                    {alert.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {plan.status === "PENDING" && session.user.role !== "VIEWER" && (
        <ConvertPlanButton planId={plan.id} instrument={plan.instrument} />
      )}
    </div>
  );
}
