import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const dv = await prisma.userDropdownValue.findUnique({ where: { id } });
  if (!dv || dv.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { label, color, isDefault, sortOrder } = await req.json();

  if (isDefault) {
    await prisma.userDropdownValue.updateMany({
      where: { userId: session.user.id, category: dv.category },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.userDropdownValue.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(color !== undefined && { color }),
      ...(isDefault !== undefined && { isDefault }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const dv = await prisma.userDropdownValue.findUnique({ where: { id } });
  if (!dv || dv.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.userDropdownValue.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
