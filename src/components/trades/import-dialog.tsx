"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseWebull, parseRobinhood, detectBroker, type ImportedTrade } from "@/lib/trade-importers";
import { toast } from "@/hooks/use-toast";

type Broker = "webull" | "robinhood";

const BROKER_INFO: Record<Broker, { label: string; color: string; steps: string[] }> = {
  webull: {
    label: "Webull",
    color: "text-blue-500 border-blue-500",
    steps: [
      'Open Webull app or web → go to "Account".',
      'Tap "History" → select "Orders" tab.',
      'Set your date range, then tap the export/download icon (top-right).',
      'Choose "Export" → save the CSV file to your device.',
      'Upload the file below.',
    ],
  },
  robinhood: {
    label: "Robinhood",
    color: "text-yellow-500 border-yellow-500",
    steps: [
      'Open Robinhood app → tap your profile icon → "Account".',
      'Scroll down to "Statements & History".',
      'Tap "Account Statements" → select a period → "Download CSV".',
      'Alternatively: robinhood.com → Account → Tax Documents → download account activity CSV.',
      'Upload the file below.',
    ],
  },
};

function BrokerCard({ broker, selected, onSelect }: { broker: Broker; selected: boolean; onSelect: () => void }) {
  const info = BROKER_INFO[broker];
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all",
        selected ? `${info.color} bg-accent` : "border-border hover:border-muted-foreground"
      )}
    >
      <p className={cn("font-semibold text-sm", selected && info.color.split(" ")[0])}>{info.label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">CSV order history</p>
    </button>
  );
}

function InstructionsPanel({ broker }: { broker: Broker }) {
  const [open, setOpen] = useState(false);
  const info = BROKER_INFO[broker];
  return (
    <div className="rounded-md border bg-muted/30 text-sm">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <span>How to export from {info.label}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <ol className="px-4 pb-3 space-y-1.5 list-decimal list-inside text-muted-foreground text-xs border-t">
          {info.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PreviewTable({ trades, errors }: { trades: ImportedTrade[]; errors: string[] }) {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const open = trades.filter((t) => t.status === "OPEN");
  const preview = trades.slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="bg-emerald-600 text-white text-xs">{closed.length} closed trades</Badge>
        <Badge variant="outline" className="text-xs">{open.length} open positions</Badge>
        {errors.length > 0 && (
          <Badge variant="destructive" className="text-xs">{errors.length} skipped rows</Badge>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              {["Instrument", "Dir", "Type", "Entry", "Exit", "Qty", "P&L", "Status"].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((t, i) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                <td className="px-2 py-1.5 font-medium">{t.instrument}</td>
                <td className="px-2 py-1.5">
                  <span className={cn("font-medium", t.direction === "LONG" ? "text-emerald-500" : "text-red-500")}>{t.direction}</span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{t.tradeType === "OPTIONS" ? (t.optionType ?? "OPT") : "EQ"}</td>
                <td className="px-2 py-1.5">${t.entryPrice.toFixed(2)}</td>
                <td className="px-2 py-1.5">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
                <td className="px-2 py-1.5">{t.quantity}</td>
                <td className={cn("px-2 py-1.5 font-semibold", t.pnl === null ? "text-muted-foreground" : t.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {t.pnl !== null ? `$${t.pnl.toFixed(2)}` : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant={t.status === "CLOSED" ? "secondary" : "outline"} className="text-xs">{t.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length > 8 && (
          <p className="text-xs text-muted-foreground px-3 py-1.5 border-t">+{trades.length - 8} more trades not shown</p>
        )}
      </div>

      {errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show skipped row details</summary>
          <ul className="mt-1 space-y-0.5 text-destructive">
            {errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ImportDialog() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [broker, setBroker] = useState<Broker>("webull");
  const [fileName, setFileName] = useState<string | null>(null);
  const [trades, setTrades] = useState<ImportedTrade[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setFileName(null);
    setTrades([]);
    setErrors([]);
    setParseError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const detected = detectBroker(text);
        const activeBroker = detected !== "unknown" ? detected : broker;
        if (detected !== "unknown" && detected !== broker) setBroker(detected);

        const result = activeBroker === "webull" ? parseWebull(text) : parseRobinhood(text);
        if (result.trades.length === 0 && result.errors.length === 0) {
          setParseError("No trades found. Make sure the file is a valid order history CSV from your broker.");
        } else if (result.trades.length === 0) {
          setParseError("Could not parse any trades. Check the file format or try switching broker.");
        } else {
          setTrades(result.trades);
          setErrors(result.errors);
        }
      } catch {
        setParseError("Failed to read file. Ensure it is a valid CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!trades.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/trades/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast({ title: `Imported ${data.imported} trades successfully` });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Import failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-500" />
            Import Trades
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Broker selector */}
          <div>
            <p className="text-sm font-medium mb-2">Select your broker</p>
            <div className="flex gap-3">
              {(["webull", "robinhood"] as Broker[]).map((b) => (
                <BrokerCard key={b} broker={b} selected={broker === b} onSelect={() => { setBroker(b); reset(); }} />
              ))}
            </div>
          </div>

          {/* Instructions */}
          <InstructionsPanel broker={broker} />

          {/* File upload */}
          <div>
            <p className="text-sm font-medium mb-2">Upload CSV file</p>
            {!fileName ? (
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-blue-500 transition-colors cursor-pointer py-8 gap-2">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload or drag &amp; drop</span>
                <span className="text-xs text-muted-foreground">CSV files only</span>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">{fileName}</span>
                  {trades.length > 0 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2.5 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}

          {/* Preview */}
          {trades.length > 0 && <PreviewTable trades={trades} errors={errors} />}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1 border-t">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={handleImport} disabled={!trades.length || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {trades.length > 0 ? `${trades.length} trades` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
