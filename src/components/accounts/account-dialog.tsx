"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#64748b",
];
const ACCOUNT_TYPES = ["Cash", "Margin", "IRA", "Roth IRA", "401k", "Paper Trading"];
const BROKERS = ["Webull", "Robinhood", "TD Ameritrade", "Interactive Brokers", "Schwab", "Fidelity", "E*TRADE", "ThinkorSwim", "Other"];

const schema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  broker: z.string().optional(),
  accountType: z.string().optional(),
  currency: z.string().length(3).default("USD"),
  color: z.string().default("#3b82f6"),
  isDefault: z.boolean().default(false),
});
type FormData = z.infer<typeof schema>;

interface Account { id: string; name: string; broker: string | null; accountType: string | null; currency: string; color: string; isDefault: boolean; }

interface Props {
  account?: Account;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

export function AccountDialog({ account, onSaved, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [color, setColor] = useState(account?.color ?? "#3b82f6");

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? "",
      broker: account?.broker ?? "",
      accountType: account?.accountType ?? "",
      currency: account?.currency ?? "USD",
      color: account?.color ?? "#3b82f6",
      isDefault: account?.isDefault ?? false,
    },
  });

  const isDefault = watch("isDefault");

  async function onSubmit(data: FormData) {
    setLoading(true);
    const url = account ? `/api/accounts/${account.id}` : "/api/accounts";
    const method = account ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, color, broker: data.broker || null, accountType: data.accountType || null }),
    });
    setLoading(false);
    if (res.ok) {
      toast({ title: account ? "Account updated" : "Account created" });
      setOpen(false);
      reset();
      onSaved();
    } else {
      const d = await res.json();
      toast({ title: d.error ?? "Failed to save", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />New Account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "New Trading Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Account Name *</Label>
            <Input {...register("name")} placeholder="e.g. Main Account, Roth IRA" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Broker</Label>
              <Select onValueChange={(v) => setValue("broker", v)} defaultValue={account?.broker ?? ""}>
                <SelectTrigger><SelectValue placeholder="Select broker" /></SelectTrigger>
                <SelectContent>
                  {BROKERS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account Type</Label>
              <Select onValueChange={(v) => setValue("accountType", v)} defaultValue={account?.accountType ?? ""}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColor(c); setValue("color", c); }}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? "white" : "transparent", boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Set as default account</Label>
              <p className="text-xs text-muted-foreground">Pre-selected when creating new trades</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={(v) => setValue("isDefault", v)} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {account ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
