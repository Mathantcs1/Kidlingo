import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat } from "@/lib/ai";
import { buildDashboardStats } from "@/lib/calculations";
import { toDecimal } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { messages } = await req.json();
  if (!Array.isArray(messages)) return new Response("Invalid messages", { status: 400 });

  const recentTrades = await prisma.trade.findMany({
    where: { userId: session.user.id, status: "CLOSED" },
    orderBy: { entryDate: "desc" },
    take: 20,
    select: { pnl: true, rMultiple: true, instrument: true, strategyTag: true, status: true, entryDate: true },
  });

  const serialized = recentTrades.map((t) => ({
    ...t,
    pnl: toDecimal(t.pnl),
    rMultiple: toDecimal(t.rMultiple),
  }));

  const stats = buildDashboardStats(serialized);
  const userContext = `Trader stats - Total P&L: $${stats.totalPnl}, Win Rate: ${stats.winRate}%, Profit Factor: ${stats.profitFactor}, Total Trades: ${stats.totalTrades}`;

  const provider = (session.user.aiProvider ?? "CLAUDE") as "CLAUDE" | "OPENAI";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        for await (const chunk of streamChat(provider, messages, userContext)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
