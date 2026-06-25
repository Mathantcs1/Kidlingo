import Papa from "papaparse";

export interface ParsedFill {
  instrument: string;
  action: "BUY" | "SELL" | "SHORT" | "COVER";
  quantity: number;
  price: number;
  date: Date;
  commission: number;
  tradeType: "EQUITY" | "OPTIONS";
  optionType: "CALL" | "PUT" | null;
  strikePrice: number | null;
  expirationDate: Date | null;
}

export interface ImportedTrade {
  instrument: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryDate: string;
  exitDate: string | null;
  commission: number | null;
  status: "OPEN" | "CLOSED";
  tradeType: "EQUITY" | "OPTIONS";
  optionType: "CALL" | "PUT" | null;
  strikePrice: number | null;
  expirationDate: string | null;
  pnl: number | null;
  // True when a SELL/COVER fill had no matching open in this CSV — it's closing an
  // existing position rather than opening a new one in the opposite direction.
  isUnmatchedClose?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.trim().toLowerCase() === k.toLowerCase()) {
        const val = row[rk];
        return val?.trim() ?? "";
      }
    }
  }
  return "";
}

function parsePrice(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

function parseQty(s: string): number {
  return Math.abs(parseFloat(s.replace(/[,\s]/g, "")) || 0);
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, "$3-$1-$2"));
  return isNaN(d.getTime()) ? null : d;
}

// Parse an options description like "AAPL 01/19/2024 Call $185.00"
function parseOptionInstrument(raw: string): {
  underlying: string;
  optionType: "CALL" | "PUT" | null;
  strike: number | null;
  expiry: Date | null;
} {
  const callMatch = raw.match(/^([A-Z]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(Call|Put)\s+\$?([\d.]+)/i);
  if (callMatch) {
    return {
      underlying: callMatch[1].toUpperCase(),
      expiry: parseDate(callMatch[2]),
      optionType: callMatch[3].toUpperCase() as "CALL" | "PUT",
      strike: parseFloat(callMatch[4]),
    };
  }
  // "AAPL01192024C00185000" OCC format
  const occMatch = raw.match(/^([A-Z]+)(\d{6})([CP])(\d+)/i);
  if (occMatch) {
    const ds = occMatch[2];
    const expiry = new Date(`20${ds.slice(4, 6)}-${ds.slice(0, 2)}-${ds.slice(2, 4)}`);
    return {
      underlying: occMatch[1].toUpperCase(),
      expiry: isNaN(expiry.getTime()) ? null : expiry,
      optionType: occMatch[3].toUpperCase() === "C" ? "CALL" : "PUT",
      strike: parseInt(occMatch[4]) / 1000,
    };
  }
  return { underlying: raw.toUpperCase(), optionType: null, strike: null, expiry: null };
}

// ── consolidate partial closes of same entry into one trade ──────────────────

function consolidateClosedTrades(trades: ImportedTrade[]): ImportedTrade[] {
  const key = (t: ImportedTrade) =>
    `${t.instrument}|${t.direction}|${t.entryDate}|${t.entryPrice}|${t.tradeType}|${t.optionType ?? ""}|${t.strikePrice ?? ""}`;

  const groups = new Map<string, ImportedTrade[]>();
  for (const t of trades) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return group[0];
    const totalQty = group.reduce((s, t) => s + t.quantity, 0);
    const weightedExit =
      group.reduce((s, t) => s + (t.exitPrice ?? 0) * t.quantity, 0) / totalQty;
    const totalPnl = group.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const totalComm = group.reduce((s, t) => s + (t.commission ?? 0), 0);
    const latestExit = group.reduce(
      (max, t) =>
        !max || new Date(t.exitDate!).getTime() > new Date(max).getTime()
          ? t.exitDate
          : max,
      null as string | null
    );
    return {
      ...group[0],
      quantity: totalQty,
      exitPrice: Math.round(weightedExit * 10000) / 10000,
      pnl: Math.round(totalPnl * 100) / 100,
      commission: Math.round(totalComm * 100) / 100,
      exitDate: latestExit,
    };
  });
}

// ── matching: fills → round-trip trades ──────────────────────────────────────

interface OpenLeg {
  fill: ParsedFill;
  partialQty: number;
  isUnmatchedClose?: boolean;
}

export function fillsToTrades(fills: ParsedFill[]): ImportedTrade[] {
  fills.sort((a, b) => a.date.getTime() - b.date.getTime());
  const openLongs: Map<string, OpenLeg[]> = new Map();
  const openShorts: Map<string, OpenLeg[]> = new Map();
  const trades: ImportedTrade[] = [];

  for (const fill of fills) {
    const key = fill.instrument;

    if (fill.action === "BUY") {
      if (!openLongs.has(key)) openLongs.set(key, []);
      openLongs.get(key)!.push({ fill, partialQty: fill.quantity });
    } else if (fill.action === "SHORT") {
      if (!openShorts.has(key)) openShorts.set(key, []);
      openShorts.get(key)!.push({ fill, partialQty: fill.quantity });
    } else if (fill.action === "SELL") {
      let remaining = fill.quantity;
      const legs = openLongs.get(key) ?? [];
      while (remaining > 0 && legs.length > 0) {
        const leg = legs[0];
        const matched = Math.min(remaining, leg.partialQty);
        const contractMultiplier = fill.tradeType === "OPTIONS" ? 100 : 1;
        const pnl = (fill.price - leg.fill.price) * matched * contractMultiplier - (fill.commission + leg.fill.commission) * (matched / fill.quantity);
        trades.push({
          instrument: key,
          direction: "LONG",
          entryPrice: leg.fill.price,
          exitPrice: fill.price,
          quantity: matched,
          entryDate: leg.fill.date.toISOString(),
          exitDate: fill.date.toISOString(),
          commission: leg.fill.commission + fill.commission,
          status: "CLOSED",
          tradeType: fill.tradeType,
          optionType: fill.optionType,
          strikePrice: fill.strikePrice,
          expirationDate: fill.expirationDate ? fill.expirationDate.toISOString() : null,
          pnl: Math.round(pnl * 100) / 100,
        });
        leg.partialQty -= matched;
        remaining -= matched;
        if (leg.partialQty <= 0) legs.shift();
      }
      // Unmatched SELL: no prior BUY in this CSV — mark as an unmatched close so
      // the server can look for an existing OPEN LONG to update instead of creating
      // a spurious SHORT position.
      if (remaining > 0) {
        if (!openShorts.has(key)) openShorts.set(key, []);
        openShorts.get(key)!.push({
          fill: { ...fill, quantity: remaining, action: "SHORT" },
          partialQty: remaining,
          isUnmatchedClose: true,
        });
      }
    } else if (fill.action === "COVER") {
      let remaining = fill.quantity;
      const legs = openShorts.get(key) ?? [];
      while (remaining > 0 && legs.length > 0) {
        const leg = legs[0];
        const matched = Math.min(remaining, leg.partialQty);
        const contractMultiplier = fill.tradeType === "OPTIONS" ? 100 : 1;
        const pnl = (leg.fill.price - fill.price) * matched * contractMultiplier - (fill.commission + leg.fill.commission) * (matched / fill.quantity);
        trades.push({
          instrument: key,
          direction: "SHORT",
          entryPrice: leg.fill.price,
          exitPrice: fill.price,
          quantity: matched,
          entryDate: leg.fill.date.toISOString(),
          exitDate: fill.date.toISOString(),
          commission: leg.fill.commission + fill.commission,
          status: "CLOSED",
          tradeType: fill.tradeType,
          optionType: fill.optionType,
          strikePrice: fill.strikePrice,
          expirationDate: fill.expirationDate ? fill.expirationDate.toISOString() : null,
          pnl: Math.round(pnl * 100) / 100,
        });
        leg.partialQty -= matched;
        remaining -= matched;
        if (leg.partialQty <= 0) legs.shift();
      }
      // Unmatched COVER: no prior SHORT in this CSV — mark so server can find existing OPEN SHORT.
      if (remaining > 0) {
        if (!openLongs.has(key)) openLongs.set(key, []);
        openLongs.get(key)!.push({
          fill: { ...fill, quantity: remaining, action: "BUY" },
          partialQty: remaining,
          isUnmatchedClose: true,
        });
      }
    }
  }

  // Remaining open positions
  for (const [key, legs] of openLongs.entries()) {
    for (const leg of legs) {
      if (leg.partialQty <= 0) continue;
      trades.push({
        instrument: key,
        direction: "LONG",
        entryPrice: leg.fill.price,
        exitPrice: null,
        quantity: leg.partialQty,
        entryDate: leg.fill.date.toISOString(),
        exitDate: null,
        commission: leg.fill.commission,
        status: "OPEN",
        tradeType: leg.fill.tradeType,
        optionType: leg.fill.optionType,
        strikePrice: leg.fill.strikePrice,
        expirationDate: leg.fill.expirationDate ? leg.fill.expirationDate.toISOString() : null,
        pnl: null,
        isUnmatchedClose: leg.isUnmatchedClose ?? false,
      });
    }
  }
  for (const [key, legs] of openShorts.entries()) {
    for (const leg of legs) {
      if (leg.partialQty <= 0) continue;
      trades.push({
        instrument: key,
        direction: "SHORT",
        entryPrice: leg.fill.price,
        exitPrice: null,
        quantity: leg.partialQty,
        entryDate: leg.fill.date.toISOString(),
        exitDate: null,
        commission: leg.fill.commission,
        status: "OPEN",
        tradeType: leg.fill.tradeType,
        optionType: leg.fill.optionType,
        strikePrice: leg.fill.strikePrice,
        expirationDate: leg.fill.expirationDate ? leg.fill.expirationDate.toISOString() : null,
        pnl: null,
        isUnmatchedClose: leg.isUnmatchedClose ?? false,
      });
    }
  }

  const closed = consolidateClosedTrades(trades.filter((t) => t.status === "CLOSED"));
  const open = trades.filter((t) => t.status === "OPEN");
  const result = [...closed, ...open];
  result.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());
  return result;
}

// ── Webull parser ─────────────────────────────────────────────────────────────

export function parseWebull(csvText: string): { trades: ImportedTrade[]; errors: string[] } {
  const errors: string[] = [];
  const result = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: true });
  const fills: ParsedFill[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];
    const symbol = col(row, "Symbol", "Ticker", "symbol");
    const actionRaw = col(row, "Action", "Side", "Trade Type", "Type", "Order Side").toLowerCase();
    const qtyRaw = col(row, "Filled Quantity", "Filled Qty", "Qty", "Quantity", "Filled");
    const priceRaw = col(row, "Average Price", "Avg Price", "Price", "Fill Price");
    const dateRaw = col(row, "Filled Time", "Filled Date", "Date/Time", "Date", "Time", "Order Time");
    const statusRaw = col(row, "Status", "Order Status").toLowerCase();
    const commRaw = col(row, "Commission", "Commission Fee", "Fees", "Fee");

    if (!symbol || !actionRaw || !priceRaw) continue;
    if (statusRaw && !["filled", "fully filled", "partial filled", "partially filled"].includes(statusRaw)) continue;

    let action: ParsedFill["action"];
    if (["buy", "buy to open", "bto"].includes(actionRaw)) action = "BUY";
    else if (["sell", "sell to close", "stc"].includes(actionRaw)) action = "SELL";
    else if (["sell short", "short", "short sell", "sell to open", "sto"].includes(actionRaw)) action = "SHORT";
    else if (["buy to cover", "cover", "buy to close", "btc"].includes(actionRaw)) action = "COVER";
    else { errors.push(`Row ${i + 2}: unrecognized action "${actionRaw}"`); continue; }

    const date = parseDate(dateRaw);
    if (!date) { errors.push(`Row ${i + 2}: invalid date "${dateRaw}"`); continue; }

    const price = parsePrice(priceRaw);
    const qty = parseQty(qtyRaw);
    if (!price || !qty) { errors.push(`Row ${i + 2}: invalid price/qty`); continue; }

    // Detect options by symbol format (e.g. "AAPL  010124C00185000" or "AAPL 01/01/2024 Call $185")
    const isOption = /\d{6}[CP]/.test(symbol) || /call|put/i.test(symbol);
    let tradeType: "EQUITY" | "OPTIONS" = isOption ? "OPTIONS" : "EQUITY";
    let optionType: "CALL" | "PUT" | null = null;
    let strikePrice: number | null = null;
    let expirationDate: Date | null = null;
    let instrument = symbol.split(" ")[0].toUpperCase();

    if (isOption) {
      const parsed = parseOptionInstrument(symbol);
      instrument = parsed.underlying;
      optionType = parsed.optionType;
      strikePrice = parsed.strike;
      expirationDate = parsed.expiry;
    }

    fills.push({ instrument, action, quantity: qty, price, date, commission: parsePrice(commRaw), tradeType, optionType, strikePrice, expirationDate });
  }

  return { trades: fillsToTrades(fills), errors };
}

// ── Robinhood parser ──────────────────────────────────────────────────────────

export function parseRobinhood(csvText: string): { trades: ImportedTrade[]; errors: string[] } {
  const errors: string[] = [];
  const result = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: true });
  const fills: ParsedFill[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];
    const instrumentRaw = col(row, "Instrument", "Symbol", "instrument");
    const transCode = col(row, "Trans Code", "Trans. Code", "Action", "Type", "trans code").trim().toUpperCase();
    const qtyRaw = col(row, "Quantity", "Qty", "quantity");
    const priceRaw = col(row, "Price", "price");
    const dateRaw = col(row, "Activity Date", "Date", "Filled Date", "activity date");

    if (!instrumentRaw || !transCode) continue;

    // Filter to trading transactions only
    const tradeCodes = ["BUY", "SELL", "BTO", "STC", "STO", "BTC", "SELL SHORT", "BUY TO COVER"];
    if (!tradeCodes.includes(transCode) && !tradeCodes.map(c => c.replace(/ /g, "")).includes(transCode)) continue;

    let action: ParsedFill["action"];
    if (["BUY", "BTO"].includes(transCode)) action = "BUY";
    else if (["SELL", "STC"].includes(transCode)) action = "SELL";
    else if (["STO", "SELLSHORT"].includes(transCode)) action = "SHORT";
    else if (["BTC", "BUYTOCOVER"].includes(transCode)) action = "COVER";
    else continue;

    const date = parseDate(dateRaw);
    if (!date) { errors.push(`Row ${i + 2}: invalid date "${dateRaw}"`); continue; }

    const price = parsePrice(priceRaw);
    const qty = parseQty(qtyRaw);
    if (!price || !qty) { errors.push(`Row ${i + 2}: invalid price/qty for ${instrumentRaw}`); continue; }

    // Options: "AAPL 01/19/2024 Call $185.00" or description contains "BTO Call AAPL..."
    const descRaw = col(row, "Description", "description");
    const isOption = /Call|Put|BTO|STC|STO|BTC/i.test(descRaw) || / (Call|Put) /i.test(instrumentRaw);
    let tradeType: "EQUITY" | "OPTIONS" = isOption ? "OPTIONS" : "EQUITY";
    let optionType: "CALL" | "PUT" | null = null;
    let strikePrice: number | null = null;
    let expirationDate: Date | null = null;
    let instrument = instrumentRaw.split(" ")[0].toUpperCase();

    if (isOption) {
      const parsed = parseOptionInstrument(instrumentRaw);
      if (parsed.optionType) {
        instrument = parsed.underlying;
        optionType = parsed.optionType;
        strikePrice = parsed.strike;
        expirationDate = parsed.expiry;
      }
      // Try description as fallback
      if (!optionType) {
        const descMatch = descRaw.match(/(Call|Put)\s+([A-Z]+)/i);
        if (descMatch) {
          optionType = descMatch[1].toUpperCase() as "CALL" | "PUT";
          instrument = descMatch[2].toUpperCase();
        }
      }
    }

    fills.push({ instrument, action, quantity: qty, price, date, commission: 0, tradeType, optionType, strikePrice, expirationDate });
  }

  return { trades: fillsToTrades(fills), errors };
}

// Auto-detect broker by inspecting headers
export function detectBroker(csvText: string): "webull" | "robinhood" | "unknown" {
  const firstLine = csvText.slice(0, 500).toLowerCase();
  if (firstLine.includes("trans code") || firstLine.includes("activity date") || firstLine.includes("process date")) return "robinhood";
  if (firstLine.includes("filled quantity") || firstLine.includes("filled qty") || firstLine.includes("avg price")) return "webull";
  if (firstLine.includes("side") && firstLine.includes("symbol")) return "webull";
  return "unknown";
}
