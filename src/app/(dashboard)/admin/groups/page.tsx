"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  owner: { id: string; name: string | null; email: string };
  _count: { members: number; trades: number };
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/groups").then((r) => r.json()).then(setGroups).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Trading Groups</h1>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No trading groups yet</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Name", "Description", "Owner", "Members", "Trades", "Created"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">{g.name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{g.description ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{g.owner.name ?? g.owner.email}</td>
                  <td className="px-3 py-2.5 text-xs">{g._count.members}</td>
                  <td className="px-3 py-2.5 text-xs">{g._count.trades}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(g.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
