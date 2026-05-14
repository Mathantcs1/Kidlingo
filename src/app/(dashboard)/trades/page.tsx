import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { TradeTable } from "@/components/trades/trade-table";
import { ImportDialog } from "@/components/trades/import-dialog";
import { AccountSelector } from "@/components/accounts/account-selector";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { toDecimal } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TradesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const params = await searchParams;

  const page = parseInt(params.page ?? "1");
  const pageSize = 20;
  const where: Record<string, unknown> = { userId: session.user.id };
  if (params.instrument) where.instrument = { contains: params.instrument, mode: "insensitive" };
  if (params.direction) where.direction = params.direction;
  if (params.status) where.status = params.status;
  if (params.account) where.tradingAccountId = params.account;

  const [trades, total, accounts] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { tradingAccount: { select: { id: true, name: true, color: true } } },
    }),
    prisma.trade.count({ where }),
    prisma.tradingAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, color: true },
      orderBy: { isDefault: "desc" },
    }),
  ]);

  const serialized = trades.map((t) => ({
    ...t,
    entryDate: t.entryDate.toISOString(),
    exitDate: t.exitDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    expirationDate: t.expirationDate?.toISOString() ?? null,
    entryPrice: toDecimal(t.entryPrice),
    exitPrice: t.exitPrice ? toDecimal(t.exitPrice) : null,
    quantity: toDecimal(t.quantity),
    pnl: t.pnl ? toDecimal(t.pnl) : null,
    rMultiple: t.rMultiple ? toDecimal(t.rMultiple) : null,
    stopLoss: t.stopLoss ? toDecimal(t.stopLoss) : null,
    takeProfit: t.takeProfit ? toDecimal(t.takeProfit) : null,
    commission: t.commission ? toDecimal(t.commission) : null,
    tradingAccount: t.tradingAccount,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Trades</h1>
          <p className="text-muted-foreground text-sm">{total} total trades</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AccountSelector />
          {session.user.role !== "VIEWER" && (
            <>
              <ImportDialog />
              <Button asChild size="sm">
                <Link href="/trades/new"><Plus className="mr-2 h-4 w-4" />New Trade</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <TradeTable trades={serialized} total={total} page={page} pageSize={pageSize} role={session.user.role} accounts={accounts} />
    </div>
  );
}
