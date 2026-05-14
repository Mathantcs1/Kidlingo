import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tradeSchema, tradeFilterSchema } from "@/lib/validations";
import { calculatePnl, calculateRMultiple } from "@/lib/calculations";
import { checkFeatureAccess } from "@/lib/subscription";
import { toDecimal } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const params = Object.fromEntries(searchParams.entries());
  const filters = tradeFilterSchema.parse(params);

  const where: Record<string, unknown> = { userId: session.user.id };
  if (filters.instrument) where.instrument = { contains: filters.instrument, mode: "insensitive" };
  if (filters.direction) where.direction = filters.direction;
  if (filters.strategyTag) where.strategyTag = filters.strategyTag;
  if (filters.status) where.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    where.entryDate = {};
    if (filters.dateFrom) (where.entryDate as Record<string, unknown>).gte = filters.dateFrom;
    if (filters.dateTo) (where.entryDate as Record<string, unknown>).lte = filters.dateTo;
  }

  const sortField = filters.sortBy === "pnl" ? "pnl" :
    filters.sortBy === "rMultiple" ? "rMultiple" :
    filters.sortBy === "instrument" ? "instrument" : "entryDate";

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: { [sortField]: filters.sortOrder },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { aiAnalyses: { select: { id: true, provider: true, type: true, createdAt: true } } },
    }),
    prisma.trade.count({ where }),
  ]);

  return NextResponse.json({ trades, total, page: filters.page, pageSize: filters.pageSize });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot create trades" }, { status: 403 });

  const access = await checkFeatureAccess(session.user.id, "trades");
  if (!access.allowed) {
    return NextResponse.json(
      { error: `Monthly trade limit reached (${access.limit}). Upgrade to ${access.plan === "FREE" ? "BASIC" : "PRO"}.`, upgrade: true },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = tradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data = parsed.data;
  let pnl: number | null = null;
  let rMultiple: number | null = null;
  let status: "OPEN" | "CLOSED" = "OPEN";

  if (data.exitPrice && data.exitDate) {
    status = "CLOSED";
    pnl = calculatePnl(
      data.direction,
      data.entryPrice,
      data.exitPrice,
      data.quantity,
      data.commission ?? 0
    );
    if (data.stopLoss) {
      rMultiple = calculateRMultiple(pnl, data.entryPrice, data.stopLoss, data.quantity);
    }
  }

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      groupId: data.groupId ?? null,
      tradingAccountId: data.tradingAccountId ?? null,
      instrument: data.instrument.toUpperCase(),
      direction: data.direction,
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice ?? null,
      quantity: data.quantity,
      entryDate: data.entryDate,
      exitDate: data.exitDate ?? null,
      strategyTag: data.strategyTag ?? null,
      sessionType: data.sessionType ?? null,
      tradeSetup: data.tradeSetup ?? null,
      notes: data.notes ?? null,
      psychology: data.psychology ?? null,
      screenshotUrl: data.screenshotUrl ?? null,
      stopLoss: data.stopLoss ?? null,
      takeProfit: data.takeProfit ?? null,
      commission: data.commission ?? null,
      pnl: pnl !== null ? pnl : null,
      rMultiple: rMultiple !== null ? rMultiple : null,
      status,
      tradeType: data.tradeType ?? "EQUITY",
      optionType: data.optionType ?? null,
      strikePrice: data.strikePrice ?? null,
      expirationDate: data.expirationDate ?? null,
      numContracts: data.numContracts ?? null,
      underlyingPrice: data.underlyingPrice ?? null,
    },
  });

  return NextResponse.json(trade, { status: 201 });
}
