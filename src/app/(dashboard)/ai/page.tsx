import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AiChatInterface } from "@/components/ai/chat-interface";
import { AiSummaryCard } from "@/components/ai/ai-summary-card";

export default async function AiPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">AI Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Chat with your trading AI powered by {session.user.aiProvider === "CLAUDE" ? "Claude" : "GPT-4"}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AiChatInterface aiProvider={session.user.aiProvider} />
        </div>
        <div>
          <AiSummaryCard />
        </div>
      </div>
    </div>
  );
}
