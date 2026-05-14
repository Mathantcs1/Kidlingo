import { TradeForm } from "@/components/trades/trade-form";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/trades");

  const params = await searchParams;

  const dropdownValues = await prisma.userDropdownValue.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  const prefill = params.prefill ? JSON.parse(decodeURIComponent(params.prefill)) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Trade</h1>
        <p className="text-muted-foreground text-sm">Log a new trade entry</p>
      </div>
      <TradeForm dropdownValues={dropdownValues} prefill={prefill} />
    </div>
  );
}
