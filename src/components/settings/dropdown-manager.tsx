"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, StarOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface DropdownValue {
  id: string;
  category: string;
  value: string;
  label: string;
  color: string | null;
  isDefault: boolean;
  sortOrder: number;
}

const CATEGORIES = [
  { key: "STRATEGY_TAG", label: "Strategy Tags" },
  { key: "INSTRUMENT", label: "Instruments / Watchlist" },
  { key: "PSYCHOLOGY_TAG", label: "Psychology Tags" },
  { key: "TRADE_SETUP", label: "Trade Setups" },
  { key: "SESSION_TYPE", label: "Session Types" },
];

export function DropdownManager({ initialValues }: { initialValues: DropdownValue[] }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});

  const byCategory = (cat: string) => values.filter((v) => v.category === cat);

  async function addValue(category: string) {
    const label = newLabels[category]?.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "-");
    const res = await fetch("/api/settings/dropdowns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, value, label, isDefault: false, sortOrder: values.filter((v) => v.category === category).length }),
    });
    if (res.ok) {
      const created = await res.json();
      setValues((prev) => [...prev, created]);
      setNewLabels((prev) => ({ ...prev, [category]: "" }));
      toast({ title: "Added" });
    } else {
      toast({ title: "Failed to add", variant: "destructive" });
    }
  }

  async function deleteValue(id: string) {
    const res = await fetch(`/api/settings/dropdowns/${id}`, { method: "DELETE" });
    if (res.ok) {
      setValues((prev) => prev.filter((v) => v.id !== id));
    }
  }

  async function setDefault(id: string, category: string) {
    const res = await fetch(`/api/settings/dropdowns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) {
      setValues((prev) => prev.map((v) =>
        v.category === category ? { ...v, isDefault: v.id === id } : v
      ));
    }
  }

  return (
    <div className="space-y-4">
      {CATEGORIES.map(({ key, label }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 min-h-8">
              {byCategory(key).map((v) => (
                <div key={v.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: v.color ?? undefined, color: v.color ?? undefined }}>
                  <span>{v.label}</span>
                  {v.isDefault && <Star className="h-3 w-3 fill-current" />}
                  <button onClick={() => setDefault(v.id, key)} className="ml-1 opacity-50 hover:opacity-100" title="Set as default">
                    <StarOff className="h-3 w-3" />
                  </button>
                  <button onClick={() => deleteValue(v.id)} className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {byCategory(key).length === 0 && (
                <span className="text-xs text-muted-foreground">No values yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={`Add ${label.toLowerCase()}...`}
                value={newLabels[key] ?? ""}
                onChange={(e) => setNewLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addValue(key)}
                className="h-8 text-xs"
              />
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => addValue(key)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
