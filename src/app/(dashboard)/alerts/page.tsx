"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, RefreshCw, CheckCheck } from "lucide-react";
import { formatDateTime, toDecimal, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Alert {
  id: string;
  instrument: string;
  alertType: string;
  targetPrice: unknown;
  message: string | null;
  status: string;
  triggeredAt: string | null;
  createdAt: string;
  plan: { id: string; instrument: string; direction: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "text-emerald-400 border-emerald-500/30",
  TRIGGERED: "text-blue-400 border-blue-500/30",
  DISMISSED: "text-muted-foreground",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadAlerts = useCallback(() => {
    setLoading(true);
    fetch("/api/alerts").then((r) => r.json()).then(setAlerts).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(async () => {
      const res = await fetch("/api/alerts/check");
      const data = await res.json();
      if (data.triggered?.length > 0) {
        toast({ title: `${data.triggered.length} price alert(s) triggered!` });
        loadAlerts();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  async function checkNow() {
    setChecking(true);
    const res = await fetch("/api/alerts/check");
    const data = await res.json();
    setChecking(false);
    if (data.triggered?.length > 0) {
      toast({ title: `${data.triggered.length} alert(s) triggered!` });
      loadAlerts();
    } else {
      toast({ title: "No alerts triggered" });
    }
  }

  async function dismissAll() {
    const triggered = alerts.filter((a) => a.status === "TRIGGERED");
    await Promise.all(
      triggered.map((a) =>
        fetch(`/api/alerts/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DISMISSED" }),
        })
      )
    );
    loadAlerts();
    toast({ title: "All triggered alerts dismissed" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Price Alerts</h1>
          <p className="text-muted-foreground text-sm">Real-time price notifications (checks every 30s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkNow} disabled={checking}>
            <RefreshCw className={cn("mr-2 h-4 w-4", checking && "animate-spin")} />
            Check Now
          </Button>
          {alerts.some((a) => a.status === "TRIGGERED") && (
            <Button variant="outline" size="sm" onClick={dismissAll}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Dismiss All
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No alerts yet. Create a trade plan to set up alerts.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Instrument", "Type", "Target Price", "Message", "Status", "Triggered At", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">{alert.instrument}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{alert.alertType.replace("_", " ")}</td>
                  <td className="px-3 py-2.5 text-xs">${toDecimal(alert.targetPrice).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[200px] truncate">{alert.message ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[alert.status])}>{alert.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {alert.triggeredAt ? formatDateTime(alert.triggeredAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {alert.status === "TRIGGERED" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={async () => {
                          await fetch(`/api/alerts/${alert.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "DISMISSED" }),
                          });
                          loadAlerts();
                        }}>
                        Dismiss
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
