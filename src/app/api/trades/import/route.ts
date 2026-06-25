import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const importedTradeSchema = z.object({
  instrument: z.string().min(1),
  direction: z.enum(["LONG", "SHORT"]),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().nullable(),
  quantity: z.number().positive(),
  entryDate: z.string(),
  exitDate: z.string().nullable(),
  commission: z.number().nullable(),
  status: z.enum(["OPEN", "CLOSED"]),
  tradeType: z.enum(["EQUITY", "OPTIONS"]).default("EQUITY"),
  optionType: z.enum(["CALL", "PUT"]).nullable(),
  strikePrice: z.number().nullable(),
  expirationDate: z.string().nullable(),
  pnl: z.number().nullable(),
  isUnmatchedClose: z.boolean().optional().default(false),
});

const bodySchema = z.object({
  trades: z.array(importedTradeSchema).min(1).max(500),
  tradingAccountId: z.string().optional().nullable(),
});

type ImportTrade = z.infer<typeof importedTradeSchema>;

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { trades, tradingAccountId } = parsed.data;

  if (tradingAccountId) {
    const account = await prisma.tradingAccount.findFirst({
      where: { id: tradingAccountId, userId: session.user.id },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ error: "Trading account not found" }, { status: 404 });
  }

  // Fetch all existing open trades. We deliberately don't filter by tradingAccountId
  // so that manually-entered trades without an account are still matched.
  const existingOpen = await prisma.trade.findMany({
    where: { userId: session.user.id, status: "OPEN" },
    select: {
      id: true,
      instrument: true,
      direction: true,
      entryDate: true,
      entryPrice: true,
      quantity: true,
    },
  });

  const matchedIds = new Set<string>();

  // Match: same instrument + direction, same calendar day for entry, price within $0.01
  function findSameDirMatch(t: ImportTrade) {
    const importDate = new Date(t.entryDate);
    return (
      existingOpen.find(
        (e) =>
          !matchedIds.has(e.id) &&
          e.instrument.toUpperCase() === t.instrument.toUpperCase() &&
          e.direction === t.direction &&
          sameDay(e.entryDate, importDate) &&
          Math.abs(Number(e.entryPrice) - t.entryPrice) < 0.01
      ) ?? null
    );
  }

  // Match: same instrument, opposite direction — for unmatched SELL/COVER fills that
  // closed an existing position whose opening fill wasn't in this CSV.
  function findOppositeDirMatch(t: ImportTrade) {
    const oppositeDir = t.direction === "LONG" ? "SHORT" : "LONG";
    return (
      existingOpen.find(
        (e) =>
          !matchedIds.has(e.id) &&
          e.instrument.toUpperCase() === t.instrument.toUpperCase() &&
          e.direction === oppositeDir
      ) ?? null
    );
  }

  interface UpdateOp {
    id: string;
    exitPrice: number | null;
    exitDate: Date | null;
    commission: number | null;
    pnl: number | null;
    quantity?: number; // only set when closing a same-direction matched position
  }

  const toUpdate: UpdateOp[] = [];
  const toCreate: ImportTrade[] = [];

  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");

  // Phase 1 — CLOSED imports: update matching existing OPEN, or queue for creation
  for (const t of closedTrades) {
    const match = findSameDirMatch(t);
    if (match) {
      toUpdate.push({
        id: match.id,
        exitPrice: t.exitPrice,
        exitDate: t.exitDate ? new Date(t.exitDate) : null,
        commission: t.commission,
        pnl: t.pnl,
        quantity: t.quantity,
      });
      matchedIds.add(match.id);
    } else {
      toCreate.push(t);
    }
  }

  // Phase 2 — OPEN imports
  for (const t of openTrades) {
    // Skip if an identical same-direction open already exists
    const sameMatch = findSameDirMatch(t);
    if (sameMatch) {
      matchedIds.add(sameMatch.id);
      continue;
    }

    if (t.isUnmatchedClose) {
      // This "open" is actually a SELL/COVER whose opening fill wasn't in this CSV.
      // The importer turned it into a synthetic opposite-direction open — find the real
      // existing position and close it.
      const oppositeMatch = findOppositeDirMatch(t);
      if (oppositeMatch) {
        const exitPrice = t.entryPrice; // SELL price = exit price of the original position
        const existingEntryPrice = Number(oppositeMatch.entryPrice);
        const existingQty = Number(oppositeMatch.quantity);
        // Options contracts carry a 100× multiplier on the price difference
        const contractMultiplier = t.tradeType === "OPTIONS" ? 100 : 1;
        const rawPnl =
          oppositeMatch.direction === "LONG"
            ? (exitPrice - existingEntryPrice) * existingQty * contractMultiplier
            : (existingEntryPrice - exitPrice) * existingQty * contractMultiplier;
        toUpdate.push({
          id: oppositeMatch.id,
          exitPrice,
          exitDate: new Date(t.entryDate),
          commission: t.commission,
          pnl: Math.round(rawPnl * 100) / 100,
          // Don't update quantity — keep the original position size from when it was opened
        });
        matchedIds.add(oppositeMatch.id);
        continue;
      }
    }

    // No match found — create as a new record
    toCreate.push(t);
  }

  // Execute updates
  await Promise.all(
    toUpdate.map((op) =>
      prisma.trade.update({
        where: { id: op.id },
        data: {
          ...(op.quantity !== undefined ? { quantity: op.quantity } : {}),
          exitPrice: op.exitPrice ?? undefined,
          exitDate: op.exitDate ?? undefined,
          commission: op.commission ?? undefined,
          status: "CLOSED",
          pnl: op.pnl ?? undefined,
        },
      })
    )
  );

  // Create remaining new trades
  let created = { count: 0 };
  if (toCreate.length > 0) {
    created = await prisma.trade.createMany({
      data: toCreate.map((t) => ({
        userId: session.user.id,
        tradingAccountId: tradingAccountId ?? undefined,
        instrument: t.instrument.toUpperCase(),
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice ?? undefined,
        quantity: t.quantity,
        entryDate: new Date(t.entryDate),
        exitDate: t.exitDate ? new Date(t.exitDate) : undefined,
        commission: t.commission ?? undefined,
        status: t.status,
        pnl: t.pnl ?? undefined,
        tradeType: t.tradeType,
        optionType: t.optionType ?? undefined,
        strikePrice: t.strikePrice ?? undefined,
        expirationDate: t.expirationDate ? new Date(t.expirationDate) : undefined,
      })),
      skipDuplicates: false,
    });
  }

  return NextResponse.json(
    {
      imported: created.count + toUpdate.length,
      created: created.count,
      updated: toUpdate.length,
    },
    { status: 201 }
  );
}
