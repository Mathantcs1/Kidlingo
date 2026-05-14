import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  broker: z.string().max(60).optional().nullable(),
  accountType: z.string().max(40).optional().nullable(),
  currency: z.string().length(3).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isDefault: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const account = await prisma.tradingAccount.findUnique({ where: { id } });
  if (!account || account.userId !== session.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.tradingAccount.updateMany({
      where: { userId: session.user.id, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.tradingAccount.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const account = await prisma.tradingAccount.findUnique({ where: { id } });
  if (!account || account.userId !== session.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unlink trades before deleting
  await prisma.trade.updateMany({ where: { tradingAccountId: id }, data: { tradingAccountId: null } });
  await prisma.tradingAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
