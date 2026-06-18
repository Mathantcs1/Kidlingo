export type {
  Trade,
  User,
  TradingGroup,
  AiAnalysis,
  TradePlan,
  PriceAlert,
  Subscription,
  UserDropdownValue,
  Role,
  AiProvider,
  TradeDirection,
  TradeStatus,
  PlanStatus,
  AlertType,
  AlertStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  DropdownCategory,
} from "@prisma/client";

export interface DashboardStats {
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  avgRR: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  openTrades: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  tradeCount: number;
}

export interface DailyPnl {
  date: string;
  pnl: number;
  trades: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GroupStats {
  totalPnl: number;
  trades: number;
  winRate: number;
  wins: number;
  losses: number;
}

export interface TradeWithAnalysis {
  id: string;
  instrument: string;
  direction: string;
  entryPrice: string | number;
  exitPrice: string | number | null;
  quantity: string | number;
  entryDate: Date;
  exitDate: Date | null;
  strategyTag: string | null;
  sessionType: string | null;
  tradeSetup: string | null;
  notes: string | null;
  psychology: string | null;
  screenshotUrl: string | null;
  exitScreenshotUrl: string | null;
  pnl: string | number | null;
  rMultiple: string | number | null;
  stopLoss: string | number | null;
  takeProfit: string | number | null;
  commission: string | number | null;
  status: string;
  userId: string;
  groupId: string | null;
  createdAt: Date;
  updatedAt: Date;
  aiAnalyses: AiAnalysisRecord[];
}

export interface AiAnalysisRecord {
  id: string;
  provider: string;
  type: string;
  content: string;
  createdAt: Date;
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  expiresAt: Date | null;
}
