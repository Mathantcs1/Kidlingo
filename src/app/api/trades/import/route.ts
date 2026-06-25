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

  // Fetch all existing open trades for this user to enable upsert matching.
  // We don't filter by tradingAccountId here so manually-created trades without
  // an account still get matched when importing into a specific account.
  const existingOpen = await prisma.trade.findMany({
    where: { userId: session.user.id, status: "OPEN" },
    select: { id: true, instrument: true, direction: true, entryDate: true, entryPrice: true },
  });

  // Find an existing open trade that represents the same position as the import row.
  // Match on: same instrument + direction, same calendar day for entry, entry price within $0.01.
  function findOpenMatch(t: ImportTrade): string | null {
    const importEntryDate = new Date(t.entryDate);
    const match = existingOpen.find(
      (e) =>
        e.instrument.toUpperCase() === t.instrument.toUpperCase() &&
        e.direction === t.direction &&
        sameDay(e.entryDate, importEntryDate) &&
        Math.abs(Number(e.entryPrice) - t.entryPrice) < 0.01
    );
    return match?.id ?? null;
  }

  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");

  const toUpdate: { id: string; trade: ImportTrade }[] = [];
  const toCreate: ImportTrade[] = [];
  const matchedIds = new Set<string>();

  // Closed imports: update existing open position OR create a new closed trade.
  for (const t of closedTrades) {
    const matchId = findOpenMatch(t);
    if (matchId && !matchedIds.has(matchId)) {
      toUpdate.push({ id: matchId, trade: t });
      matchedIds.add(matchId);
    } else {
      toCreate.push(t);
    }
  }

  // Open imports: skip if an identical open position already exists in the DB.
  for (const t of openTrades) {
    const matchId = findOpenMatch(t);
    if (!matchId || matchedIds.has(matchId)) {
      toCreate.push(t);
    }
    // else: already present — skip to avoid duplicates
  }

  // Update existing open → closed
  await Promise.all(
    toUpdate.map(({ id, trade: t }) =>
      prisma.trade.update({
        where: { id },
        data: {
          quantity: t.quantity,
          exitPrice: t.exitPrice ?? undefined,
          exitDate: t.exitDate ? new Date(t.exitDate) : undefined,
          commission: t.commission ?? undefined,
          status: "CLOSED",
          pnl: t.pnl ?? undefined,
        },
      })
    )
  );

  // Create remaining trades
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
