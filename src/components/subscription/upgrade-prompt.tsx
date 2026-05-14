import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import Link from "next/link";

interface UpgradePromptProps {
  feature: string;
  currentPlan: string;
  limit?: number;
}

export function UpgradePrompt({ feature, currentPlan, limit }: UpgradePromptProps) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Upgrade Required
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {limit
            ? `You've reached the ${feature} limit (${limit}/month) on your ${currentPlan} plan.`
            : `${feature} requires a higher plan. You're currently on ${currentPlan}.`}
        </p>
        <Button size="sm" asChild className="bg-amber-600 hover:bg-amber-700">
          <Link href="/settings#subscription">Upgrade Plan</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
