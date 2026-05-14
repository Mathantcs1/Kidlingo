import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscriptionUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const body = await req.json();
  const parsed = subscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const sub = await prisma.subscription.upsert({
    where: { userId },
    update: { ...parsed.data, enabledBy: session.user.id },
    create: { userId, ...parsed.data, enabledBy: session.user.id },
  });

  return NextResponse.json(sub);
}
