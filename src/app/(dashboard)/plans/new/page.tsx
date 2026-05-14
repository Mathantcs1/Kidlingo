import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PlanForm } from "@/components/plans/plan-form";

export default async function NewPlanPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/plans");

  const dropdownValues = await prisma.userDropdownValue.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">New Trade Plan</h1>
      <PlanForm dropdownValues={dropdownValues} />
    </div>
  );
}
