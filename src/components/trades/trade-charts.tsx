"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Maximize2, ImageOff } from "lucide-react";

interface TradeChartsProps {
  entryUrl: string | null;
  exitUrl: string | null;
}

function ChartThumb({ label, url, onExpand }: { label: string; url: string; onExpand: () => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <button
        type="button"
        onClick={onExpand}
        className="group relative w-full rounded-lg overflow-hidden border block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="w-full h-48 object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Maximize2 className="h-5 w-5 text-white" />
        </div>
      </button>
    </div>
  );
}

export function TradeCharts({ entryUrl, exitUrl }: TradeChartsProps) {
  const [expanded, setExpanded] = useState<{ label: string; url: string } | null>(null);

  if (!entryUrl && !exitUrl) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Chart Screenshots</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entryUrl ? (
          <ChartThumb label="Entry Chart" url={entryUrl} onExpand={() => setExpanded({ label: "Entry Chart", url: entryUrl })} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed h-48 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-xs">No entry chart</span>
          </div>
        )}
        {exitUrl ? (
          <ChartThumb label="Exit Chart" url={exitUrl} onExpand={() => setExpanded({ label: "Exit Chart", url: exitUrl })} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed h-48 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-xs">No exit chart</span>
          </div>
        )}
      </CardContent>

      <Dialog open={!!expanded} onOpenChange={(v) => !v && setExpanded(null)}>
        <DialogContent className="max-w-3xl">
          {expanded && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={expanded.url} alt={expanded.label} className="w-full rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
