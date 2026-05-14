import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentPrice } from "@/lib/quotes";
import { toDecimal } from "@/lib/utils";

export async function GET(_req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeAlerts = await prisma.priceAlert.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
  });

  if (activeAlerts.length === 0) return NextResponse.json({ triggered: [] });

  // Group by instrument to minimize API calls
  const instruments = [...new Set(activeAlerts.map((a) => a.instrument))];
  const prices: Record<string, number | null> = {};
  await Promise.all(
    instruments.map(async (inst) => {
      prices[inst] = await getCurrentPrice(inst);
    })
  );

  const triggered: string[] = [];

  for (const alert of activeAlerts) {
    const currentPrice = prices[alert.instrument];
    if (currentPrice === null) continue;

    const target = toDecimal(alert.targetPrice);
    let hit = false;

    switch (alert.alertType) {
      case "PRICE_ABOVE":
      case "ENTRY_HIT":
      case "EXIT_HIT":
        hit = currentPrice >= target;
        break;
      case "PRICE_BELOW":
      case "STOP_HIT":
        hit = currentPrice <= target;
        break;
    }

    if (hit) {
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: { status: "TRIGGERED", triggeredAt: new Date() },
      });

      if (alert.planId) {
        await prisma.tradePlan.updateMany({
          where: { id: alert.planId, status: "PENDING" },
          data: { status: "TRIGGERED" },
        });
      }

      triggered.push(alert.id);
    }
  }

  return NextResponse.json({ triggered, prices });
}
