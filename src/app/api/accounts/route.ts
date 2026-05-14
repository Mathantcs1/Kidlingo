import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(60),
  broker: z.string().max(60).optional().nullable(),
  accountType: z.string().max(40).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3b82f6"),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.tradingAccount.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { trades: true } },
      trades: {
        where: { status: "CLOSED" },
        select: { pnl: true },
      },
    },
  });

  const enriched = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    broker: a.broker,
    accountType: a.accountType,
    currency: a.currency,
    color: a.color,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
    tradeCount: a._count.trades,
    totalPnl: a.trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0),
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.tradingAccount.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  const account = await prisma.tradingAccount.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json(account, { status: 201 });
}
