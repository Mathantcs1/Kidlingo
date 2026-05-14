import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PlanBadge({ plan }: { plan: string }) {
  const config: Record<string, { label: string; className: string }> = {
    FREE: { label: "FREE", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
    BASIC: { label: "BASIC", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    PRO: { label: "PRO", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  };
  const { label, className } = config[plan] ?? config.FREE;
  return <Badge variant="outline" className={cn("text-xs", className)}>{label}</Badge>;
}
