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

  const created = await prisma.trade.createMany({
    data: trades.map((t) => ({
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

  return NextResponse.json({ imported: created.count }, { status: 201 });
}
