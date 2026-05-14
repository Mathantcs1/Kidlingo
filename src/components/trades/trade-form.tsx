"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tradeSchema } from "@/lib/validations";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, cn, toDecimal } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { calculatePnl, calculateRMultiple } from "@/lib/calculations";

type FormData = z.infer<typeof tradeSchema>;

interface DropdownValue {
  id: string;
  category: string;
  value: string;
  label: string;
  color: string | null;
  isDefault: boolean;
}

interface TradeFormProps {
  dropdownValues: DropdownValue[];
  prefill?: Partial<FormData> | null;
  existingTrade?: FormData & { id: string };
}

export function TradeForm({ dropdownValues, prefill, existingTrade }: TradeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const byCategory = (cat: string) => dropdownValues.filter((v) => v.category === cat);
  const getDefault = (cat: string) => byCategory(cat).find((v) => v.isDefault)?.value ?? "";

  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(tradeSchema),
    defaultValues: existingTrade ?? {
      direction: "LONG",
      entryDate: new Date().toISOString().slice(0, 16) as unknown as Date,
      strategyTag: prefill?.strategyTag ?? getDefault("STRATEGY_TAG") ?? undefined,
      sessionType: getDefault("SESSION_TYPE") ?? undefined,
      tradeSetup: getDefault("TRADE_SETUP") ?? undefined,
      instrument: prefill?.instrument ?? getDefault("INSTRUMENT") ?? undefined,
      ...(prefill ?? {}),
    },
  });

  const watchedValues = useWatch({ control });
  const livePnl = (() => {
    const { direction, entryPrice, exitPrice, quantity, commission } = watchedValues;
    if (!direction || !entryPrice || !exitPrice || !quantity) return null;
    return calculatePnl(direction, Number(entryPrice), Number(exitPrice), Number(quantity), Number(commission ?? 0));
  })();

  const liveRR = (() => {
    const { direction, entryPrice, stopLoss, exitPrice, quantity } = watchedValues;
    if (!livePnl || !stopLoss || !entryPrice || !quantity) return null;
    return calculateRMultiple(livePnl, Number(entryPrice), Number(stopLoss), Number(quantity));
  })();

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");
    const url = existingTrade ? `/api/trades/${existingTrade.id}` : "/api/trades";
    const method = existingTrade ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      if (json.upgrade) {
        setError(json.error);
        return;
      }
      setError(json.error ?? "Failed to save trade");
      return;
    }

    toast({ title: existingTrade ? "Trade updated" : "Trade added" });
    router.push("/trades");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Live preview */}
      {livePnl !== null && (
        <Card className={cn("border-2", livePnl >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-2">
              {livePnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              <span className="text-sm font-medium">Estimated P&L</span>
            </div>
            <div className="flex items-center gap-4">
              <span className={cn("text-lg font-bold", livePnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                {formatCurrency(livePnl)}
              </span>
              {liveRR !== null && (
                <span className={cn("text-sm font-medium", liveRR >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {liveRR.toFixed(2)}R
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Trade Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="instrument">Instrument *</Label>
            <Select defaultValue={getDefault("INSTRUMENT")} onValueChange={(v) => setValue("instrument", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select or type..." />
              </SelectTrigger>
              <SelectContent>
                {byCategory("INSTRUMENT").map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Or type symbol (e.g. AAPL)" {...register("instrument")} className="mt-1 text-xs" />
            {errors.instrument && <p className="text-xs text-red-400">{errors.instrument.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Direction *</Label>
            <Select defaultValue="LONG" onValueChange={(v) => setValue("direction", v as "LONG" | "SHORT")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">🟢 Long</SelectItem>
                <SelectItem value="SHORT">🔴 Short</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Entry Price *</Label>
            <Input type="number" step="any" placeholder="0.00" {...register("entryPrice")} />
            {errors.entryPrice && <p className="text-xs text-red-400">{errors.entryPrice.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Exit Price</Label>
            <Input type="number" step="any" placeholder="0.00 (leave empty if open)" {...register("exitPrice")} />
          </div>

          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <Input type="number" step="any" placeholder="0" {...register("quantity")} />
            {errors.quantity && <p className="text-xs text-red-400">{errors.quantity.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Commission</Label>
            <Input type="number" step="any" placeholder="0.00" {...register("commission")} />
          </div>

          <div className="space-y-1.5">
            <Label>Entry Date *</Label>
            <Input type="datetime-local" {...register("entryDate")} />
            {errors.entryDate && <p className="text-xs text-red-400">{errors.entryDate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Exit Date</Label>
            <Input type="datetime-local" {...register("exitDate")} />
          </div>

          <div className="space-y-1.5">
            <Label>Stop Loss</Label>
            <Input type="number" step="any" placeholder="0.00" {...register("stopLoss")} />
          </div>

          <div className="space-y-1.5">
            <Label>Take Profit</Label>
            <Input type="number" step="any" placeholder="0.00" {...register("takeProfit")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Categorization</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Strategy</Label>
            <Select defaultValue={getDefault("STRATEGY_TAG") || undefined} onValueChange={(v) => setValue("strategyTag", v)}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {byCategory("STRATEGY_TAG").map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Session Type</Label>
            <Select defaultValue={getDefault("SESSION_TYPE") || undefined} onValueChange={(v) => setValue("sessionType", v)}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {byCategory("SESSION_TYPE").map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Trade Setup</Label>
            <Select defaultValue={getDefault("TRADE_SETUP") || undefined} onValueChange={(v) => setValue("tradeSetup", v)}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {byCategory("TRADE_SETUP").map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Notes & Psychology</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Trade Notes</Label>
            <Textarea placeholder="What happened? Entry rationale, observations..." rows={4} {...register("notes")} />
          </div>
          <div className="space-y-1.5">
            <Label>Psychology</Label>
            <Select defaultValue={getDefault("PSYCHOLOGY_TAG") || undefined} onValueChange={(v) => setValue("psychology", v)}>
              <SelectTrigger><SelectValue placeholder="Emotional state..." /></SelectTrigger>
              <SelectContent>
                {byCategory("PSYCHOLOGY_TAG").map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Additional psychology notes..." rows={2} {...register("psychology")} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {existingTrade ? "Update Trade" : "Add Trade"}
        </Button>
      </div>
    </form>
  );
}
