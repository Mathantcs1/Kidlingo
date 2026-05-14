import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { priceAlertSchema } from "@/lib/validations";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const alerts = await prisma.priceAlert.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as "ACTIVE" | "TRIGGERED" | "DISMISSED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { id: true, instrument: true, direction: true } } },
  });

  return NextResponse.json(alerts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = priceAlertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const alert = await prisma.priceAlert.create({
    data: {
      userId: session.user.id,
      instrument: parsed.data.instrument.toUpperCase(),
      alertType: parsed.data.alertType,
      targetPrice: parsed.data.targetPrice,
      message: parsed.data.message ?? null,
      planId: parsed.data.planId ?? null,
    },
  });

  return NextResponse.json(alert, { status: 201 });
}
