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
  const alert = await prisma.priceAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { status } = await req.json();
  const updated = await prisma.priceAlert.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const alert = await prisma.priceAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.priceAlert.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
