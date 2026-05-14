"use client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export function ConvertPlanButton({ planId, instrument }: { planId: string; instrument: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    setLoading(true);
    const res = await fetch(`/api/plans/${planId}/convert`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Failed to convert plan", variant: "destructive" });
      return;
    }
    const params = encodeURIComponent(JSON.stringify(data.prefill));
    router.push(`/trades/new?prefill=${params}`);
  }

  return (
    <Button onClick={handleConvert} disabled={loading} className="w-full">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
      Convert to Trade — {instrument}
    </Button>
  );
}
