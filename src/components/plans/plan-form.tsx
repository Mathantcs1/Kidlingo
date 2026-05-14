"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tradePlanSchema } from "@/lib/validations";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { InstrumentSearch } from "@/components/trades/instrument-search";
import { CandlestickChart } from "@/components/charts/candlestick-chart";

type FormData = z.infer<typeof tradePlanSchema>;

interface PlanFormProps {
  dropdownValues: { id: string; category: string; value: string; label: string; isDefault: boolean }[];
}

export function PlanForm({ dropdownValues }: PlanFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // selectedSymbol tracks the raw input; confirmedSymbol tracks what's been
  // validated via the dropdown (triggers the chart).
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [confirmedSymbol, setConfirmedSymbol] = useState("");
  const selectedSymbolRef = useRef("");
  const chartRef = useRef<HTMLDivElement>(null);

  const byCategory = (cat: string) => dropdownValues.filter((v) => v.category === cat);
  const getDefault = (cat: string) => byCategory(cat).find((v) => v.isDefault)?.value ?? "";

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(tradePlanSchema),
    defaultValues: {
      direction: "LONG",
      date: new Date().toISOString().slice(0, 10) as unknown as Date,
      instrument: getDefault("INSTRUMENT") || undefined,
      alertsEnabled: true,
    },
  });

  const alertsEnabled = watch("alertsEnabled");
  const entryPrice = watch("entryPrice");
  const stopLoss = watch("stopLoss");
  const takeProfit = watch("takeProfit");

  const rr =
    entryPrice && stopLoss && takeProfit
      ? (Number(takeProfit) - Number(entryPrice)) / (Number(entryPrice) - Number(stopLoss))
      : null;

  const priceLevels = [
    entryPrice && { price: Number(entryPrice), label: "Entry", color: "#3b82f6" },
    stopLoss && { price: Number(stopLoss), label: "SL", color: "#ef4444", dash: true },
    takeProfit && { price: Number(takeProfit), label: "TP", color: "#10b981", dash: true },
  ].filter(Boolean) as { price: number; label: string; color: string; dash?: boolean }[];

  function handleInstrumentChange(symbol: string) {
    selectedSymbolRef.current = symbol;
    setSelectedSymbol(symbol);
    setValue("instrument", symbol);
  }

  function handlePriceLoaded(price: number | null) {
    // Symbol was confirmed via dropdown — show the chart now
    const sym = selectedSymbolRef.current;
    if (sym) {
      setConfirmedSymbol(sym);
      // Scroll chart into view on narrow screens where it's below the form
      requestAnimationFrame(() => {
        chartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    if (price != null && !entryPrice) {
      setValue("entryPrice", price as unknown as number);
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast({ title: json.error ?? "Failed to create plan", variant: "destructive" });
      return;
    }
    toast({ title: "Trade plan created" + (data.alertsEnabled ? " with alerts" : "") });
    router.push("/plans");
    router.refresh();
  }

  return (
    <div className={confirmedSymbol ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" : ""}>
      {/* Left: form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {rr !== null && !isNaN(rr) && rr > 0 && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="py-2 px-4 text-sm">
              Risk/Reward: <span className="font-bold text-blue-400">{rr.toFixed(2)}R</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm">Plan Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register("date")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Instrument *</Label>
              <InstrumentSearch
                value={selectedSymbol}
                onChange={handleInstrumentChange}
                onPriceLoaded={handlePriceLoaded}
              />
              {errors.instrument && (
                <p className="text-xs text-destructive">{errors.instrument.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Direction *</Label>
              <Select defaultValue="LONG" onValueChange={(v) => setValue("direction", v as "LONG" | "SHORT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LONG">🟢 Long</SelectItem>
                  <SelectItem value="SHORT">🔴 Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entry Price *</Label>
              <Input type="number" step="any" {...register("entryPrice")} />
            </div>
            <div className="space-y-1.5">
              <Label>Stop Loss *</Label>
              <Input type="number" step="any" {...register("stopLoss")} />
            </div>
            <div className="space-y-1.5">
              <Label>Take Profit *</Label>
              <Input type="number" step="any" {...register("takeProfit")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Rationale</Label>
              <Textarea
                placeholder="Why are you taking this trade? What setup do you see?"
                {...register("rationale")}
                rows={3}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <div>
                <Label>Enable Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when price hits entry, stop, or target
                </p>
              </div>
              <Switch
                checked={alertsEnabled}
                onCheckedChange={(v) => setValue("alertsEnabled", v)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Plan
          </Button>
        </div>
      </form>

      {/* Right (or below on small screens): candlestick chart */}
      {confirmedSymbol && (
        <div ref={chartRef} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{confirmedSymbol}</h2>
            <span className="text-xs text-muted-foreground">Price Chart</span>
          </div>
          <CandlestickChart symbol={confirmedSymbol} priceLevels={priceLevels} />
        </div>
      )}
    </div>
  );
}
