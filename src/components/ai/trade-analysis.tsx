"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TradeAiAnalysisProps {
  tradeId: string;
  aiProvider: string;
  existingAnalysis: { id: string; content: string; provider: string; createdAt: Date } | null;
  autoAnalyze?: boolean;
}

export function TradeAiAnalysis({ tradeId, aiProvider, existingAnalysis, autoAnalyze }: TradeAiAnalysisProps) {
  const [analysis, setAnalysis] = useState(existingAnalysis?.content ?? "");
  const [provider, setProvider] = useState(existingAnalysis?.provider ?? aiProvider);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (autoAnalyze && !existingAnalysis) analyze();
  }, [autoAnalyze]);

  async function analyze() {
    setLoading(true);
    const res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast({ title: data.error ?? "Analysis failed", variant: "destructive" });
      return;
    }
    setAnalysis(data.analysis);
    setProvider(data.provider);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-sm">AI Analysis</CardTitle>
          {provider && <Badge variant="outline" className="text-xs">{provider}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={analyze} disabled={loading}>
          <RefreshCw className={`mr-2 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {analysis ? "Re-analyze" : "Analyze"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : analysis ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^# (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h4>$1</h4>") }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Click &ldquo;Analyze&rdquo; to get AI-powered insights on this trade using {aiProvider === "CLAUDE" ? "Claude" : "GPT-4"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
