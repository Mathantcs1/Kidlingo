"use client";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SubRecord {
  id: string;
  userId: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; role: string };
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "text-muted-foreground",
  BASIC: "text-blue-400 border-blue-500/30",
  PRO: "text-amber-400 border-amber-500/30",
};

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<SubRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/subscriptions").then((r) => r.json()).then(setSubs).finally(() => setLoading(false));
  }, []);

  async function updatePlan(userId: string, plan: string) {
    setSaving(userId);
    const res = await fetch(`/api/admin/subscriptions/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, status: "ACTIVE" }),
    });
    setSaving(null);
    if (res.ok) {
      toast({ title: `Plan updated to ${plan}` });
      setSubs((prev) => prev.map((s) => s.userId === userId ? { ...s, plan } : s));
    } else {
      toast({ title: "Failed to update plan", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Subscription Management</h1>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["User", "Email", "Plan", "Status", "Expires", "Change Plan"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map((sub) => (
                <tr key={sub.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">{sub.user.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.user.email}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={cn("text-xs", PLAN_COLORS[sub.plan])}>{sub.plan}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={sub.status === "ACTIVE" ? "secondary" : "outline"} className="text-xs">{sub.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.expiresAt ? formatDate(sub.expiresAt) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Select defaultValue={sub.plan} onValueChange={(v) => updatePlan(sub.userId, v)}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FREE">Free</SelectItem>
                          <SelectItem value="BASIC">Basic</SelectItem>
                          <SelectItem value="PRO">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                      {saving === sub.userId && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
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
