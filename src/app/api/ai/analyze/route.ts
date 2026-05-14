import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeTrade } from "@/lib/ai";
import { checkFeatureAccess } from "@/lib/subscription";
import { toDecimal } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tradeId } = await req.json();
  if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  if (trade.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const provider = (session.user.aiProvider ?? "CLAUDE") as "CLAUDE" | "OPENAI";

  const existing = await prisma.aiAnalysis.findFirst({
    where: { tradeId, userId: session.user.id, provider, type: "TRADE_ANALYSIS" },
  });
  if (existing) {
    return NextResponse.json({ analysis: existing.content, provider, cached: true });
  }

  const access = await checkFeatureAccess(session.user.id, "ai_analysis");
  if (!access.allowed) {
    return NextResponse.json(
      { error: `AI analysis limit reached (${access.limit}/month). Upgrade to get more.`, upgrade: true },
      { status: 403 }
    );
  }

  const tradeData = {
    instrument: trade.instrument,
    direction: trade.direction,
    entryPrice: toDecimal(trade.entryPrice),
    exitPrice: trade.exitPrice ? toDecimal(trade.exitPrice) : null,
    quantity: toDecimal(trade.quantity),
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    pnl: trade.pnl ? toDecimal(trade.pnl) : null,
    rMultiple: trade.rMultiple ? toDecimal(trade.rMultiple) : null,
    stopLoss: trade.stopLoss ? toDecimal(trade.stopLoss) : null,
    takeProfit: trade.takeProfit ? toDecimal(trade.takeProfit) : null,
    strategyTag: trade.strategyTag,
    sessionType: trade.sessionType,
    tradeSetup: trade.tradeSetup,
    notes: trade.notes,
    psychology: trade.psychology,
    status: trade.status,
  };

  const content = await analyzeTrade(provider, tradeData);

  await prisma.aiAnalysis.create({
    data: {
      tradeId,
      userId: session.user.id,
      provider,
      type: "TRADE_ANALYSIS",
      content,
      metadata: { model: provider === "CLAUDE" ? "claude-opus-4-5" : "gpt-4o" },
    },
  });

  return NextResponse.json({ analysis: content, provider, cached: false });
}
