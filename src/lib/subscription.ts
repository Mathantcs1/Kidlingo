import { prisma } from "./prisma";

export type Feature =
  | "trades"
  | "ai_analysis"
  | "trade_plans"
  | "trading_groups"
  | "csv_export";

const PLAN_LIMITS: Record<string, Record<Feature, number | boolean>> = {
  FREE: {
    trades: 20,
    ai_analysis: 5,
    trade_plans: 5,
    trading_groups: 0,
    csv_export: false,
  },
  BASIC: {
    trades: 200,
    ai_analysis: 50,
    trade_plans: 50,
    trading_groups: 1,
    csv_export: true,
  },
  PRO: {
    trades: Infinity,
    ai_analysis: Infinity,
    trade_plans: Infinity,
    trading_groups: Infinity,
    csv_export: true,
  },
};

export async function getUserSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) {
    return await prisma.subscription.create({
      data: { userId, plan: "FREE", status: "ACTIVE" },
    });
  }
  return sub;
}

export async function checkFeatureAccess(
  userId: string,
  feature: Feature,
  currentMonthCount?: number
): Promise<{ allowed: boolean; limit: number | boolean; current?: number; plan: string }> {
  const sub = await getUserSubscription(userId);
  const plan = sub.plan;
  const limits = PLAN_LIMITS[plan];
  const limit = limits[feature];

  if (typeof limit === "boolean") {
    return { allowed: limit, limit, plan };
  }

  if (limit === Infinity) {
    return { allowed: true, limit: -1, plan };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let count = currentMonthCount;
  if (count === undefined) {
    if (feature === "trades") {
      count = await prisma.trade.count({
        where: { userId, createdAt: { gte: monthStart } },
      });
    } else if (feature === "ai_analysis") {
      count = await prisma.aiAnalysis.count({
        where: { userId, createdAt: { gte: monthStart } },
      });
    } else if (feature === "trade_plans") {
      count = await prisma.tradePlan.count({
        where: { userId, createdAt: { gte: monthStart } },
      });
    } else {
      count = 0;
    }
  }

  return {
    allowed: count < (limit as number),
    limit: limit as number,
    current: count,
    plan,
  };
}

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}
