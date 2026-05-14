import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePortfolioSummary } from "@/lib/ai";
import { toDecimal } from "@/lib/utils";
import { checkFeatureAccess } from "@/lib/subscription";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { period = "weekly" } = await req.json();
  const provider = (session.user.aiProvider ?? "CLAUDE") as "CLAUDE" | "OPENAI";

  const access = await checkFeatureAccess(session.user.id, "ai_analysis");
  if (!access.allowed) {
    return NextResponse.json({ error: "AI limit reached. Upgrade to continue.", upgrade: true }, { status: 403 });
  }

  const now = new Date();
  const dateFrom =
    period === "weekly"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), 1);

  const trades = await prisma.trade.findMany({
    where: { userId: session.user.id, status: "CLOSED", entryDate: { gte: dateFrom } },
    orderBy: { entryDate: "asc" },
  });

  if (trades.length === 0) {
    return NextResponse.json({ summary: "No closed trades found for this period.", provider });
  }

  const tradeData = trades.map((t) => ({
    instrument: t.instrument,
    direction: t.direction,
    pnl: toDecimal(t.pnl),
    rMultiple: toDecimal(t.rMultiple),
    strategyTag: t.strategyTag,
    psychology: t.psychology,
    entryDate: t.entryDate,
  }));

  const summary = await generatePortfolioSummary(provider, tradeData, period as "weekly" | "monthly");

  await prisma.aiAnalysis.create({
    data: {
      userId: session.user.id,
      provider,
      type: period === "weekly" ? "WEEKLY_SUMMARY" : "MONTHLY_SUMMARY",
      content: summary,
    },
  });

  return NextResponse.json({ summary, provider });
}
