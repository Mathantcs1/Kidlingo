import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatDate, formatCurrency, toDecimal, cn } from "@/lib/utils";
import { AlertBanner } from "@/components/alerts/alert-banner";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  TRIGGERED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default async function PlansPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const plans = await prisma.tradePlan.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    include: { alerts: true },
    take: 50,
  });

  const triggeredAlerts = await prisma.priceAlert.findMany({
    where: { userId: session.user.id, status: "TRIGGERED" },
    orderBy: { triggeredAt: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Plans</h1>
          <p className="text-muted-foreground text-sm">Pre-market planning & alerts</p>
        </div>
        {session.user.role !== "VIEWER" && (
          <Button asChild size="sm">
            <Link href="/plans/new"><Plus className="mr-2 h-4 w-4" />New Plan</Link>
          </Button>
        )}
      </div>

      {triggeredAlerts.length > 0 && <AlertBanner alerts={triggeredAlerts} />}

      <div className="grid gap-3">
        {plans.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No trade plans yet. Create one to set entry/exit criteria and get alerts.</p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/plans/new">Create First Plan</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {plans.map((plan) => {
          const entry = toDecimal(plan.entryPrice);
          const sl = toDecimal(plan.stopLoss);
          const tp = toDecimal(plan.takeProfit);
          const rr = (tp - entry) / (entry - sl);
          const activeAlerts = plan.alerts.filter((a) => a.status === "ACTIVE").length;
          const triggeredCount = plan.alerts.filter((a) => a.status === "TRIGGERED").length;

          return (
            <Link key={plan.id} href={`/plans/${plan.id}`}>
              <Card className="hover:bg-muted/20 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{plan.instrument}</span>
                          <Badge variant="outline" className={cn("text-xs", plan.direction === "LONG" ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30")}>
                            {plan.direction}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[plan.status])}>
                            {plan.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(plan.date)} · Entry ${entry.toFixed(2)} · SL ${sl.toFixed(2)} · TP ${tp.toFixed(2)}
                          {!isNaN(rr) && rr > 0 && ` · ${rr.toFixed(1)}R`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {triggeredCount > 0 && (
                        <Badge className="bg-blue-600 text-white text-xs">{triggeredCount} triggered</Badge>
                      )}
                      {activeAlerts > 0 && (
                        <Badge variant="outline" className="text-xs">{activeAlerts} active alerts</Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
