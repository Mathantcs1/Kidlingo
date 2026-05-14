"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  _count: { trades: number };
  subscription: { plan: string; status: string } | null;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  TRADER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  VIEWER: "bg-muted text-muted-foreground",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers).finally(() => setLoading(false));
  }, []);

  async function updateRole(userId: string, role: string) {
    setSaving(userId);
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setSaving(null);
    if (res.ok) {
      toast({ title: "Role updated" });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
    } else {
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">User Management</h1>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Name", "Email", "Role", "Plan", "Trades", "Joined", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">{user.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{user.email}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={cn("text-xs", ROLE_COLORS[user.role])}>{user.role}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-xs">{user.subscription?.plan ?? "FREE"}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{user._count.trades}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(user.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Select defaultValue={user.role} onValueChange={(v) => updateRole(user.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="TRADER">Trader</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      {saving === user.id && <Loader2 className="h-3 w-3 animate-spin" />}
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
