import { prisma } from "./prisma";

const DEFAULT_DROPDOWN_VALUES = [
  // Strategy Tags
  { category: "STRATEGY_TAG" as const, value: "breakout", label: "Breakout", color: "#3b82f6", isDefault: false, sortOrder: 0 },
  { category: "STRATEGY_TAG" as const, value: "mean-reversion", label: "Mean Reversion", color: "#8b5cf6", isDefault: false, sortOrder: 1 },
  { category: "STRATEGY_TAG" as const, value: "trend-follow", label: "Trend Follow", color: "#10b981", isDefault: true, sortOrder: 2 },
  { category: "STRATEGY_TAG" as const, value: "scalp", label: "Scalp", color: "#f59e0b", isDefault: false, sortOrder: 3 },
  { category: "STRATEGY_TAG" as const, value: "swing", label: "Swing", color: "#ef4444", isDefault: false, sortOrder: 4 },
  // Instruments
  { category: "INSTRUMENT" as const, value: "AAPL", label: "AAPL", color: null, isDefault: true, sortOrder: 0 },
  { category: "INSTRUMENT" as const, value: "SPY", label: "SPY", color: null, isDefault: false, sortOrder: 1 },
  { category: "INSTRUMENT" as const, value: "QQQ", label: "QQQ", color: null, isDefault: false, sortOrder: 2 },
  { category: "INSTRUMENT" as const, value: "TSLA", label: "TSLA", color: null, isDefault: false, sortOrder: 3 },
  { category: "INSTRUMENT" as const, value: "BTC/USD", label: "BTC/USD", color: null, isDefault: false, sortOrder: 4 },
  { category: "INSTRUMENT" as const, value: "ETH/USD", label: "ETH/USD", color: null, isDefault: false, sortOrder: 5 },
  { category: "INSTRUMENT" as const, value: "EUR/USD", label: "EUR/USD", color: null, isDefault: false, sortOrder: 6 },
  // Psychology Tags
  { category: "PSYCHOLOGY_TAG" as const, value: "disciplined", label: "Disciplined", color: "#10b981", isDefault: true, sortOrder: 0 },
  { category: "PSYCHOLOGY_TAG" as const, value: "fomo", label: "FOMO", color: "#ef4444", isDefault: false, sortOrder: 1 },
  { category: "PSYCHOLOGY_TAG" as const, value: "revenge-trade", label: "Revenge Trade", color: "#dc2626", isDefault: false, sortOrder: 2 },
  { category: "PSYCHOLOGY_TAG" as const, value: "patient", label: "Patient", color: "#3b82f6", isDefault: false, sortOrder: 3 },
  { category: "PSYCHOLOGY_TAG" as const, value: "overconfident", label: "Overconfident", color: "#f59e0b", isDefault: false, sortOrder: 4 },
  // Trade Setups
  { category: "TRADE_SETUP" as const, value: "ema-cross", label: "EMA Cross", color: "#3b82f6", isDefault: false, sortOrder: 0 },
  { category: "TRADE_SETUP" as const, value: "support-resistance", label: "Support/Resistance", color: "#8b5cf6", isDefault: true, sortOrder: 1 },
  { category: "TRADE_SETUP" as const, value: "flag-pattern", label: "Flag Pattern", color: "#10b981", isDefault: false, sortOrder: 2 },
  { category: "TRADE_SETUP" as const, value: "gap-fill", label: "Gap Fill", color: "#f59e0b", isDefault: false, sortOrder: 3 },
  // Session Types
  { category: "SESSION_TYPE" as const, value: "pre-market", label: "Pre-Market", color: "#8b5cf6", isDefault: false, sortOrder: 0 },
  { category: "SESSION_TYPE" as const, value: "regular", label: "Regular Hours", color: "#10b981", isDefault: true, sortOrder: 1 },
  { category: "SESSION_TYPE" as const, value: "after-hours", label: "After Hours", color: "#f59e0b", isDefault: false, sortOrder: 2 },
  { category: "SESSION_TYPE" as const, value: "overnight", label: "Overnight", color: "#6366f1", isDefault: false, sortOrder: 3 },
];

export async function seedUserDefaults(userId: string) {
  await prisma.userDropdownValue.createMany({
    data: DEFAULT_DROPDOWN_VALUES.map((v) => ({ ...v, userId })),
    skipDuplicates: true,
  });
}
