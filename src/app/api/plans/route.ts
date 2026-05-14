import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tradePlanSchema } from "@/lib/validations";
import { checkFeatureAccess } from "@/lib/subscription";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const where: Record<string, unknown> = { userId: session.user.id };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const plans = await prisma.tradePlan.findMany({
    where,
    orderBy: { date: "desc" },
    include: { alerts: true },
  });

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const access = await checkFeatureAccess(session.user.id, "trade_plans");
  if (!access.allowed) {
    return NextResponse.json({ error: `Trade plan limit reached (${access.limit}/month). Upgrade to continue.`, upgrade: true }, { status: 403 });
  }

  const body = await req.json();
  const parsed = tradePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data = parsed.data;
  const plan = await prisma.tradePlan.create({
    data: {
      userId: session.user.id,
      date: data.date,
      instrument: data.instrument.toUpperCase(),
      direction: data.direction,
      entryPrice: data.entryPrice,
      stopLoss: data.stopLoss,
      takeProfit: data.takeProfit,
      rationale: data.rationale ?? null,
      alertsEnabled: data.alertsEnabled,
    },
  });

  if (data.alertsEnabled) {
    await prisma.priceAlert.createMany({
      data: [
        { userId: session.user.id, planId: plan.id, instrument: plan.instrument, alertType: "ENTRY_HIT", targetPrice: data.entryPrice, message: `${plan.instrument} entry price hit: $${data.entryPrice}` },
        { userId: session.user.id, planId: plan.id, instrument: plan.instrument, alertType: "STOP_HIT", targetPrice: data.stopLoss, message: `${plan.instrument} stop loss hit: $${data.stopLoss}` },
        { userId: session.user.id, planId: plan.id, instrument: plan.instrument, alertType: "EXIT_HIT", targetPrice: data.takeProfit, message: `${plan.instrument} take profit hit: $${data.takeProfit}` },
      ],
    });
  }

  return NextResponse.json(plan, { status: 201 });
}
