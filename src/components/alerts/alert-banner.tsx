"use client";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { formatDateTime, toDecimal } from "@/lib/utils";

interface PriceAlertRecord {
  id: string;
  instrument: string;
  alertType: string;
  targetPrice: unknown;
  message: string | null;
  triggeredAt: Date | null;
}

export function AlertBanner({ alerts }: { alerts: PriceAlertRecord[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = alerts.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  async function dismiss(id: string) {
    await fetch(`/api/alerts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    setDismissed((prev) => [...prev, id]);
  }

  return (
    <div className="space-y-2">
      {visible.map((alert) => (
        <Alert key={alert.id} className="border-blue-500/30 bg-blue-500/5">
          <Bell className="h-4 w-4 text-blue-500" />
          <AlertTitle className="flex items-center justify-between">
            <span>Price Alert Triggered — {alert.instrument}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismiss(alert.id)}>
              <X className="h-3 w-3" />
            </Button>
          </AlertTitle>
          <AlertDescription className="text-xs">
            {alert.message ?? `${alert.alertType.replace("_", " ")}: $${toDecimal(alert.targetPrice).toFixed(2)}`}
            {alert.triggeredAt && ` · ${formatDateTime(alert.triggeredAt)}`}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
