import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tradeSchema } from "@/lib/validations";
import { calculatePnl, calculateRMultiple } from "@/lib/calculations";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { aiAnalyses: true },
  });

  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (trade.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(trade);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (trade.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    pnl = calculatePnl(data.direction, data.entryPrice, data.exitPrice, data.quantity, data.commission ?? 0);
    if (data.stopLoss) {
      rMultiple = calculateRMultiple(pnl, data.entryPrice, data.stopLoss, data.quantity);
    }
  }

  const updated = await prisma.trade.update({
    where: { id },
    data: {
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
      exitScreenshotUrl: data.exitScreenshotUrl ?? null,
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

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (trade.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.trade.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
