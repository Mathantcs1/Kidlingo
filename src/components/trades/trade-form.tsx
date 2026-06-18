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
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ACCOUNT_STORAGE_KEY } from "@/components/accounts/account-selector";
import { formatCurrency, cn, toDecimal } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { calculatePnl, calculateRMultiple } from "@/lib/calculations";
import { InstrumentSearch } from "./instrument-search";

type FormData = z.infer<typeof tradeSchema>;

interface DropdownValue {
  id: string; category: string; value: string; label: string; color: string | null; isDefault: boolean;
}

interface TradeFormProps {
  dropdownValues: DropdownValue[];
  prefill?: Partial<FormData> | null;
  existingTrade?: FormData & { id: string };
}

interface TradingAccount { id: string; name: string; broker: string | null; color: string; isDefault: boolean; }

export function TradeForm({ dropdownValues, prefill, existingTrade }: TradeFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [tradeType, setTradeType] = useState<"EQUITY" | "OPTIONS">(
    (existingTrade as Record<string, unknown>)?.tradeType as "EQUITY" | "OPTIONS" ?? "EQUITY"
  );
  const [optionType, setOptionType] = useState<"CALL" | "PUT">(
    (existingTrade as Record<string, unknown>)?.optionType as "CALL" | "PUT" ?? "CALL"
  );
  const [numContracts, setNumContracts] = useState<number>(
    ((existingTrade as Record<string, unknown>)?.numContracts as number) ?? 1
  );
  const [strikePrice, setStrikePrice] = useState<string>(
    String((existingTrade as Record<string, unknown>)?.strikePrice ?? "")
  );
  const [expirationDate, setExpirationDate] = useState<string>(
    (existingTrade as Record<string, unknown>)?.expirationDate
      ? new Date((existingTrade as Record<string, unknown>).expirationDate as string).toISOString().slice(0, 10)
      : ""
  );
  const [underlyingPrice, setUnderlyingPrice] = useState<string>(
    String((existingTrade as Record<string, unknown>)?.underlyingPrice ?? "")
  );

  // Load accounts and set default
  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((data: TradingAccount[]) => {
      if (!Array.isArray(data)) return;
      setAccounts(data);
      if (existingTrade) {
        const et = existingTrade as Record<string, unknown>;
        setSelectedAccountId((et.tradingAccountId as string) ?? "");
      } else {
        // Priority: URL param > localStorage > default account
        const urlAccount = searchParams.get("account");
        const storedAccount = localStorage.getItem(ACCOUNT_STORAGE_KEY);
        const defaultAccount = data.find((a) => a.isDefault);
        const resolved = urlAccount ?? storedAccount ?? defaultAccount?.id ?? "";
        setSelectedAccountId(resolved);
        setValue("tradingAccountId", resolved || null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const { direction, entryPrice, stopLoss, quantity } = watchedValues;
    if (!livePnl || !stopLoss || !entryPrice || !quantity) return null;
    return calculateRMultiple(livePnl, Number(entryPrice), Number(stopLoss), Number(quantity));
  })();

  const totalOptionsCost = tradeType === "OPTIONS" && watchedValues.entryPrice && numContracts
    ? Number(watchedValues.entryPrice) * numContracts * 100
    : null;

  const riskRewardBar = (() => {
    const entry = Number(watchedValues.entryPrice);
    const stop = Number(watchedValues.stopLoss);
    const target = Number(watchedValues.takeProfit);
    if (!entry || !stop || !target) return null;
    const min = Math.min(entry, stop, target);
    const max = Math.max(entry, stop, target);
    const range = max - min || 1;
    const pct = (v: number) => ((v - min) / range) * 100;
    const riskAmt = Math.abs(entry - stop);
    const rewardAmt = Math.abs(target - entry);
    return {
      entryPct: pct(entry), stopPct: pct(stop), targetPct: pct(target),
      riskAmt, rewardAmt,
      rrRatio: riskAmt > 0 ? rewardAmt / riskAmt : null,
    };
  })();

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const payload: Record<string, unknown> = {
      ...data,
      tradingAccountId: selectedAccountId || null,
      tradeType,
      ...(tradeType === "OPTIONS" && {
        optionType,
        strikePrice: strikePrice ? Number(strikePrice) : undefined,
        expirationDate: expirationDate ? new Date(expirationDate).toISOString() : undefined,
        numContracts,
        underlyingPrice: underlyingPrice ? Number(underlyingPrice) : undefined,
        quantity: numContracts * 100,
      }),
    };

    const url = existingTrade ? `/api/trades/${existingTrade.id}` : "/api/trades";
    const method = existingTrade ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.upgrade ? json.error : (json.error ?? "Failed to save trade"));
      return;
    }
    toast({ title: existingTrade ? "Trade updated" : "Trade added" });
    router.push("/trades");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Live P&L preview */}
      {livePnl !== null && (
        <Card className={cn(
          "border-2 transition-colors duration-300 animate-in fade-in slide-in-from-top-2",
          livePnl >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
        )}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-2">
              {livePnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              <span className="text-sm font-medium">Estimated P&L</span>
              {tradeType === "OPTIONS" && <span className="text-xs text-muted-foreground">(premium × 100 per contract)</span>}
            </div>
            <div className="flex items-center gap-4">
              <span className={cn("text-lg font-bold transition-colors duration-300", livePnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                {formatCurrency(livePnl)}
              </span>
              {liveRR !== null && (
                <span className={cn("text-sm font-medium transition-colors duration-300", liveRR >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {liveRR.toFixed(2)}R
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trade Type Toggle */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Trade Type</CardTitle></CardHeader>
        <CardContent>
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            {(["EQUITY", "OPTIONS"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTradeType(t)}
                className={cn(
                  "px-6 py-2 text-sm font-medium transition-all duration-150",
                  tradeType === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t === "EQUITY" ? "📈 Equity / ETF" : "⚡ Options"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Core trade details */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Trade Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Account selector */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                Trading Account
              </Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedAccountId(""); setValue("tradingAccountId", null); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                    !selectedAccountId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  None
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setSelectedAccountId(a.id); setValue("tradingAccountId", a.id); }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                      selectedAccountId === a.id
                        ? "border-2 font-medium"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                    style={selectedAccountId === a.id ? { borderColor: a.color, color: a.color, background: `${a.color}15` } : {}}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                    {a.name}
                    {a.broker && <span className="text-xs opacity-60">· {a.broker}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Instrument search */}
          <div className="space-y-1.5">
            <Label>Instrument *</Label>
            <InstrumentSearch
              value={watchedValues.instrument ?? ""}
              onChange={(v) => setValue("instrument", v)}
              onPriceLoaded={(price) => {
                if (price) {
                  setUnderlyingPrice(String(price));
                  if (tradeType === "EQUITY") setValue("entryPrice", price as unknown as number);
                }
              }}
            />
            {errors.instrument && <p className="text-xs text-red-400">{errors.instrument.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Direction *</Label>
              <Select defaultValue={existingTrade?.direction ?? "LONG"} onValueChange={(v) => setValue("direction", v as "LONG" | "SHORT")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LONG">{tradeType === "OPTIONS" ? "🟢 Buy (Long)" : "🟢 Long"}</SelectItem>
                  <SelectItem value="SHORT">{tradeType === "OPTIONS" ? "🔴 Sell/Write (Short)" : "🔴 Short"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Entry Date *</Label>
              <Input type="datetime-local" {...register("entryDate")} />
              {errors.entryDate && <p className="text-xs text-red-400">{errors.entryDate.message}</p>}
            </div>

            {tradeType === "EQUITY" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Entry Price *</Label>
                  <Input type="number" step="any" placeholder="0.00" {...register("entryPrice")} />
                  {errors.entryPrice && <p className="text-xs text-red-400">{errors.entryPrice.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Exit Price</Label>
                  <Input type="number" step="any" placeholder="Leave empty if open" {...register("exitPrice")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity *</Label>
                  <Input type="number" step="any" placeholder="Shares" {...register("quantity")} />
                  {errors.quantity && <p className="text-xs text-red-400">{errors.quantity.message}</p>}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Entry Premium <span className="text-xs text-muted-foreground">(per share)</span> *</Label>
                  <Input type="number" step="any" placeholder="e.g. 3.50" {...register("entryPrice")} />
                  {errors.entryPrice && <p className="text-xs text-red-400">{errors.entryPrice.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Exit Premium <span className="text-xs text-muted-foreground">(per share)</span></Label>
                  <Input type="number" step="any" placeholder="Leave empty if open" {...register("exitPrice")} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Stop Loss</Label>
              <Input type="number" step="any" placeholder="0.00" {...register("stopLoss")} />
            </div>
            <div className="space-y-1.5">
              <Label>Take Profit</Label>
              <Input type="number" step="any" placeholder="0.00" {...register("takeProfit")} />
            </div>
            <div className="space-y-1.5">
              <Label>Exit Date</Label>
              <Input type="datetime-local" {...register("exitDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Commission</Label>
              <Input type="number" step="any" placeholder="0.00" {...register("commission")} />
            </div>
          </div>

          {/* Live risk/reward visual */}
          {riskRewardBar && (
            <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Risk <span className="font-semibold text-red-400">{formatCurrency(riskRewardBar.riskAmt)}</span>
                </span>
                {riskRewardBar.rrRatio !== null && (
                  <span className="font-medium">1 : {riskRewardBar.rrRatio.toFixed(2)} R:R</span>
                )}
                <span className="text-muted-foreground">
                  Reward <span className="font-semibold text-emerald-400">{formatCurrency(riskRewardBar.rewardAmt)}</span>
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 rounded-full bg-red-500/40 transition-all duration-300"
                  style={{
                    left: `${Math.min(riskRewardBar.stopPct, riskRewardBar.entryPct)}%`,
                    width: `${Math.abs(riskRewardBar.entryPct - riskRewardBar.stopPct)}%`,
                  }}
                />
                <div
                  className="absolute inset-y-0 rounded-full bg-emerald-500/40 transition-all duration-300"
                  style={{
                    left: `${Math.min(riskRewardBar.entryPct, riskRewardBar.targetPct)}%`,
                    width: `${Math.abs(riskRewardBar.targetPct - riskRewardBar.entryPct)}%`,
                  }}
                />
                {[
                  { pct: riskRewardBar.stopPct, color: "bg-red-500", label: "Stop Loss" },
                  { pct: riskRewardBar.entryPct, color: "bg-primary", label: "Entry" },
                  { pct: riskRewardBar.targetPct, color: "bg-emerald-500", label: "Take Profit" },
                ].map((marker) => (
                  <div
                    key={marker.label}
                    title={marker.label}
                    className={cn("absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background shadow transition-all duration-300 hover:scale-125", marker.color)}
                    style={{ left: `calc(${marker.pct}% - 6px)` }}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Options contract details */}
      {tradeType === "OPTIONS" && (
        <Card className="border-purple-500/30 bg-purple-500/5 animate-in fade-in slide-in-from-top-2 duration-300">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-purple-400 border-purple-500/40">OPTIONS</Badge>
              Contract Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Option Type */}
            <div className="space-y-1.5">
              <Label>Option Type *</Label>
              <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                {(["CALL", "PUT"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOptionType(t)}
                    className={cn(
                      "px-5 py-2 text-sm font-medium transition-all duration-150",
                      optionType === t
                        ? t === "CALL" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {t === "CALL" ? "📈 CALL" : "📉 PUT"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Strike Price *</Label>
                <Input
                  type="number" step="any" placeholder="e.g. 150.00"
                  value={strikePrice}
                  onChange={(e) => setStrikePrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expiration Date *</Label>
                <Input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Number of Contracts *</Label>
                <Input
                  type="number" min="1" placeholder="1"
                  value={numContracts}
                  onChange={(e) => {
                    const n = Math.max(1, parseInt(e.target.value) || 1);
                    setNumContracts(n);
                    setValue("quantity", (n * 100) as unknown as number);
                  }}
                />
                <p className="text-xs text-muted-foreground">1 contract = 100 shares</p>
              </div>
              <div className="space-y-1.5">
                <Label>Underlying Price</Label>
                <Input
                  type="number" step="any" placeholder="Stock price at entry"
                  value={underlyingPrice}
                  onChange={(e) => setUnderlyingPrice(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Auto-filled from quote</p>
              </div>
            </div>

            {/* Total cost summary */}
            {totalOptionsCost !== null && (
              <div className="rounded-md bg-muted p-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Contract Value</span>
                <span className="font-bold">
                  {numContracts} contract{numContracts !== 1 ? "s" : ""} × {Number(watchedValues.entryPrice).toFixed(2)} × 100 = <span className="text-primary">${totalOptionsCost.toFixed(2)}</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Categorization */}
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

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Notes & Psychology</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Trade Notes</Label>
            <Textarea placeholder="Entry rationale, observations..." rows={4} {...register("notes")} />
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
