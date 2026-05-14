import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dropdownValueSchema } from "@/lib/validations";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const values = await prisma.userDropdownValue.findMany({
    where: {
      userId: session.user.id,
      ...(category ? { category: category as never } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return NextResponse.json(values);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = dropdownValueSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.userDropdownValue.updateMany({
      where: { userId: session.user.id, category: parsed.data.category },
      data: { isDefault: false },
    });
  }

  const value = await prisma.userDropdownValue.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json(value, { status: 201 });
}
