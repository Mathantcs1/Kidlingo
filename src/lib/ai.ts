// eslint-disable-next-line @typescript-eslint/no-require-imports
function getAnthropic(apiKey?: string | null) { const A = require("@anthropic-ai/sdk"); return new A.default({ apiKey: apiKey || (process.env.ANTHROPIC_API_KEY ?? "no-key") }); }
// eslint-disable-next-line @typescript-eslint/no-require-imports
function getOpenAI(apiKey?: string | null) { const O = require("openai"); return new O.default({ apiKey: apiKey || (process.env.OPENAI_API_KEY ?? "no-key") }); }

export type AiProvider = "CLAUDE" | "OPENAI";

export interface UserApiKeys {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
}

const TRADE_ANALYSIS_SYSTEM = `You are an expert trading coach analyzing a trade journal entry. Provide:
1. **Pattern Recognition** - what setup/pattern was used
2. **Risk Assessment** - evaluate the R:R ratio and position sizing
3. **Psychology Analysis** - observations from the psychology notes
4. **Improvement Suggestions** - 3 specific, actionable improvements

Be concise, direct, and constructive. Format with markdown headers.`;

const PORTFOLIO_SYSTEM = (period: string) =>
  `You are an expert trading performance analyst. Summarize the trader's ${period} performance covering: key patterns, strengths, weaknesses, what the metrics indicate, and exactly 3 action items for the next ${period}.`;

const CHAT_SYSTEM = (context: string) =>
  `You are a trading journal AI assistant. User context: ${context}. Help with trade analysis, strategy review, and performance improvement. Be concise and actionable.`;

export async function analyzeTrade(
  provider: AiProvider,
  tradeData: Record<string, unknown>,
  userKeys?: UserApiKeys
): Promise<string> {
  const message = `Analyze this trade:\n${JSON.stringify(tradeData, null, 2)}`;

  if (provider === "CLAUDE") {
    const msg = await getAnthropic(userKeys?.anthropicApiKey).messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: TRADE_ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: message }],
    });
    return (msg.content[0] as { text: string }).text;
  }

  const completion = await getOpenAI(userKeys?.openaiApiKey).chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: TRADE_ANALYSIS_SYSTEM },
      { role: "user", content: message },
    ],
    max_tokens: 1024,
  });
  return completion.choices[0].message.content ?? "";
}

export async function generatePortfolioSummary(
  provider: AiProvider,
  trades: Record<string, unknown>[],
  period: "weekly" | "monthly",
  userKeys?: UserApiKeys
): Promise<string> {
  const message = `${period.toUpperCase()} PERFORMANCE DATA (${trades.length} trades):\n${JSON.stringify(trades, null, 2)}`;
  const system = PORTFOLIO_SYSTEM(period);

  if (provider === "CLAUDE") {
    const msg = await getAnthropic(userKeys?.anthropicApiKey).messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: message }],
    });
    return (msg.content[0] as { text: string }).text;
  }

  const completion = await getOpenAI(userKeys?.openaiApiKey).chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: message },
    ],
  });
  return completion.choices[0].message.content ?? "";
}

export async function* streamChat(
  provider: AiProvider,
  messages: { role: "user" | "assistant"; content: string }[],
  userContext: string,
  userKeys?: UserApiKeys
): AsyncGenerator<string> {
  const system = CHAT_SYSTEM(userContext);

  if (provider === "CLAUDE") {
    const stream = getAnthropic(userKeys?.anthropicApiKey).messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system,
      messages,
    });
    for await (const chunk of await stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        yield chunk.delta.text;
      }
    }
    return;
  }

  const stream = await getOpenAI(userKeys?.openaiApiKey).chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
  });
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content ?? "";
  }
}
