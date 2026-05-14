"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  symbol: string;
  shortName: string;
  exchange: string;
  type: string;
}

interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  volume: number | null;
  high52: number | null;
  low52: number | null;
  pe: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  currency: string;
  exchange: string | null;
}

interface InstrumentSearchProps {
  value: string;
  onChange: (symbol: string) => void;
  onPriceLoaded?: (price: number | null) => void;
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(decimals)}`;
}

function fmtVol(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

export function InstrumentSearch({ value, onChange, onPriceLoaded }: InstrumentSearchProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 1) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowDropdown(data.length > 0);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    onChange(v);
    setQuote(null);
    setExpanded(false);
    search(v);
  }

  async function selectSymbol(symbol: string) {
    setQuery(symbol);
    onChange(symbol);
    setShowDropdown(false);
    setSuggestions([]);
    setLoadingQuote(true);
    setExpanded(true);
    try {
      const res = await fetch(`/api/instruments/quote?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const data: Quote = await res.json();
        setQuote(data);
        onPriceLoaded?.(data.price);
      }
    } finally {
      setLoadingQuote(false);
    }
  }

  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder="Search ticker (e.g. AAPL, TSLA, SPY)..."
          className="pr-8"
          autoComplete="off"
        />
        {loadingSuggestions && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                type="button"
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent text-sm text-left"
                onMouseDown={() => selectSymbol(s.symbol)}
              >
                <div>
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="ml-2 text-muted-foreground text-xs truncate max-w-[200px]">{s.shortName}</span>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{s.exchange ?? s.type}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quote panel */}
      {(loadingQuote || quote) && (
        <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
          {/* Header row - always visible */}
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors"
            onClick={() => setExpanded((e) => !e)}
          >
            {loadingQuote ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading quote...
              </div>
            ) : quote ? (
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{quote.symbol}</span>
                <span className="text-sm text-muted-foreground">{quote.name}</span>
                {quote.price != null && (
                  <span className="font-bold text-sm">${quote.price.toFixed(2)}</span>
                )}
                {quote.changePercent != null && (
                  <span className={cn("flex items-center gap-0.5 text-xs font-medium", isPositive ? "text-emerald-500" : "text-red-500")}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isPositive ? "+" : ""}{(quote.changePercent * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            ) : null}
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          </button>

          {/* Expanded details */}
          {expanded && quote && !loadingQuote && (
            <div className="px-3 pb-3 space-y-3 border-t border-border">
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 mt-3">
                {[
                  ["52W High", fmt(quote.high52)],
                  ["52W Low", fmt(quote.low52)],
                  ["Volume", fmtVol(quote.volume)],
                  ["Market Cap", fmt(quote.marketCap)],
                  ["P/E Ratio", quote.pe != null ? quote.pe.toFixed(1) : "—"],
                  ["Exchange", quote.exchange ?? "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xs font-medium">{val}</p>
                  </div>
                ))}
              </div>
              {(quote.sector || quote.industry) && (
                <div className="flex gap-2 flex-wrap">
                  {quote.sector && <Badge variant="secondary" className="text-xs">{quote.sector}</Badge>}
                  {quote.industry && <Badge variant="outline" className="text-xs">{quote.industry}</Badge>}
                </div>
              )}
              {quote.description && (
                <div>
                  <p className={cn("text-xs text-muted-foreground leading-relaxed", !showFullDesc && "line-clamp-3")}>
                    {quote.description}
                  </p>
                  <button type="button" onClick={() => setShowFullDesc((s) => !s)}
                    className="text-xs text-primary hover:underline mt-1">
                    {showFullDesc ? "Show less" : "Show more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
