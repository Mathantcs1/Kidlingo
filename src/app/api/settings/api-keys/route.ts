import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  anthropicApiKey: z.string().min(1).nullable().optional(),
  openaiApiKey: z.string().min(1).nullable().optional(),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const data: Record<string, string | null> = {};
  if ("anthropicApiKey" in parsed.data) data.anthropicApiKey = parsed.data.anthropicApiKey ?? null;
  if ("openaiApiKey" in parsed.data) data.openaiApiKey = parsed.data.openaiApiKey ?? null;

  await prisma.user.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { anthropicApiKey: true, openaiApiKey: true },
  });

  const mask = (key: string | null | undefined) =>
    key ? `...${key.slice(-4)}` : null;

  return NextResponse.json({
    anthropicKeyHint: mask(user?.anthropicApiKey),
    openaiKeyHint: mask(user?.openaiApiKey),
  });
}
