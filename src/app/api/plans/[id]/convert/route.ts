import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.tradePlan.findUnique({ where: { id } });
  if (!plan || plan.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prefill = {
    instrument: plan.instrument,
    direction: plan.direction,
    entryPrice: plan.entryPrice,
    stopLoss: plan.stopLoss,
    takeProfit: plan.takeProfit,
    entryDate: new Date().toISOString(),
    planId: plan.id,
  };

  return NextResponse.json({ prefill });
}
