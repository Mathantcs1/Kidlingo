import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/subscription";
import Papa from "papaparse";
import { toDecimal } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(session.user.id, "csv_export");
  if (!access.allowed) {
    return NextResponse.json({ error: "CSV export requires BASIC or PRO plan", upgrade: true }, { status: 403 });
  }

  const trades = await prisma.trade.findMany({
    where: { userId: session.user.id },
    orderBy: { entryDate: "desc" },
  });

  const rows = trades.map((t) => ({
    Date: t.entryDate.toISOString().split("T")[0],
    Instrument: t.instrument,
    Direction: t.direction,
    Status: t.status,
    EntryPrice: toDecimal(t.entryPrice),
    ExitPrice: t.exitPrice ? toDecimal(t.exitPrice) : "",
    Quantity: toDecimal(t.quantity),
    PnL: t.pnl ? toDecimal(t.pnl) : "",
    RMultiple: t.rMultiple ? toDecimal(t.rMultiple) : "",
    StopLoss: t.stopLoss ? toDecimal(t.stopLoss) : "",
    TakeProfit: t.takeProfit ? toDecimal(t.takeProfit) : "",
    Commission: t.commission ? toDecimal(t.commission) : "",
    Strategy: t.strategyTag ?? "",
    Session: t.sessionType ?? "",
    Setup: t.tradeSetup ?? "",
    Notes: t.notes ?? "",
    Psychology: t.psychology ?? "",
    ExitDate: t.exitDate ? t.exitDate.toISOString().split("T")[0] : "",
  }));

  const csv = Papa.unparse(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="trades-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
