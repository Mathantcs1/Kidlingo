"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function AiSummaryCard() {
  const [summary, setSummary] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  async function generate(p: "weekly" | "monthly") {
    setLoading(true);
    setPeriod(p);
    const res = await fetch("/api/ai/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: p }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast({ title: data.error ?? "Summary failed", variant: "destructive" });
      return;
    }
    setSummary(data.summary);
    setProvider(data.provider);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          Portfolio Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => generate("weekly")} disabled={loading}>
            Weekly
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => generate("monthly")} disabled={loading}>
            Monthly
          </Button>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : summary ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">{period}</Badge>
              {provider && <Badge variant="outline" className="text-xs">{provider}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{summary}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Generate a weekly or monthly AI summary of your trading performance.</p>
        )}
      </CardContent>
    </Card>
  );
}
