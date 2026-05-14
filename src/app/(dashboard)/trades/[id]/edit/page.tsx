import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { toDecimal } from "@/lib/utils";
import { TradeForm } from "@/components/trades/trade-form";

export default async function EditTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/trades");

  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) notFound();
  if (trade.userId !== session.user.id && session.user.role !== "ADMIN") redirect("/trades");

  const dropdownValues = await prisma.userDropdownValue.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  const serialized = {
    ...trade,
    id: trade.id,
    entryPrice: toDecimal(trade.entryPrice),
    exitPrice: trade.exitPrice ? toDecimal(trade.exitPrice) : undefined,
    quantity: toDecimal(trade.quantity),
    stopLoss: trade.stopLoss ? toDecimal(trade.stopLoss) : undefined,
    takeProfit: trade.takeProfit ? toDecimal(trade.takeProfit) : undefined,
    commission: trade.commission ? toDecimal(trade.commission) : undefined,
    pnl: trade.pnl ? toDecimal(trade.pnl) : undefined,
    rMultiple: trade.rMultiple ? toDecimal(trade.rMultiple) : undefined,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Edit Trade</h1>
      <TradeForm dropdownValues={dropdownValues} existingTrade={serialized as never} />
    </div>
  );
}
