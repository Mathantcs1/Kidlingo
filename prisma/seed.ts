import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedUserDefaults } from "../src/lib/seed-defaults";

const prisma = new PrismaClient();

function rnd(min: number, max: number) { return min + Math.random() * (max - min); }
function rndInt(min: number, max: number) { return Math.floor(rnd(min, max + 1)); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000); }

async function seedTrades(
  userId: string,
  accountId: string,
  profile: {
    instruments: string[];
    strategies: string[];
    count: number;
    winBias: number; // 0–1, higher = more wins
    avgMove: number; // avg price move fraction
    maxDaysAgo: number;
  }
) {
  const directions: ("LONG" | "SHORT")[] = ["LONG", "SHORT"];
  const psychTags = ["Disciplined", "Revenge Trade", "FOMO", "Patient", "Overconfident", "Rule-based"];

  for (let i = 0; i < profile.count; i++) {
    const instrument = profile.instruments[rndInt(0, profile.instruments.length - 1)];
    const direction = directions[Math.random() > 0.3 ? 0 : 1];
    const basePrice = rnd(50, 500);
    const entryPrice = basePrice;
    const isWin = Math.random() < profile.winBias;
    const move = rnd(0.005, profile.avgMove) * basePrice * (isWin ? 1 : -1);
    const exitPrice = direction === "LONG" ? entryPrice + move : entryPrice - move;
    const quantity = rndInt(5, 200);
    const commission = Math.round(rnd(0, 8) * 100) / 100;
    const rawPnl = (exitPrice - entryPrice) * quantity * (direction === "LONG" ? 1 : -1) - commission;
    const pnl = Math.round(rawPnl * 100) / 100;
    const dayOffset = rndInt(0, profile.maxDaysAgo);
    const entryDate = daysAgo(dayOffset);
    const exitDate = new Date(entryDate.getTime() + rnd(600000, 28800000));
    const strategy = profile.strategies[rndInt(0, profile.strategies.length - 1)];

    await prisma.trade.create({
      data: {
        userId,
        tradingAccountId: accountId,
        instrument,
        direction,
        entryPrice,
        exitPrice,
        quantity,
        entryDate,
        exitDate,
        strategyTag: strategy,
        psychology: psychTags[rndInt(0, psychTags.length - 1)],
        commission,
        pnl,
        stopLoss: direction === "LONG" ? entryPrice * 0.98 : entryPrice * 1.02,
        takeProfit: direction === "LONG" ? entryPrice * 1.05 : entryPrice * 0.95,
        rMultiple: Math.round((pnl / (entryPrice * quantity * 0.02)) * 1000) / 1000,
        status: "CLOSED",
      },
    });
  }
}

async function main() {
  // ── Admin ──────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("Password123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tradingjournal.com" },
    update: {},
    create: { email: "admin@tradingjournal.com", name: "Admin User", password: adminPassword, role: "ADMIN" },
  });
  await prisma.subscription.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, plan: "PRO", status: "ACTIVE" },
  });
  await seedUserDefaults(admin.id);

  // ── Demo Trader ────────────────────────────────────────────────────────────
  const traderPassword = await bcrypt.hash("Password123!", 12);
  const trader = await prisma.user.upsert({
    where: { email: "trader@tradingjournal.com" },
    update: {},
    create: { email: "trader@tradingjournal.com", name: "Demo Trader", password: traderPassword, role: "TRADER" },
  });
  await prisma.subscription.upsert({
    where: { userId: trader.id },
    update: {},
    create: { userId: trader.id, plan: "PRO", status: "ACTIVE" },
  });
  await seedUserDefaults(trader.id);

  // ── Demo trading accounts ─────────────────────────────────────────────────
  const existingAccounts = await prisma.tradingAccount.count({ where: { userId: trader.id } });
  if (existingAccounts === 0) {
    const [mainAccount, iraAccount, paperAccount] = await Promise.all([
      prisma.tradingAccount.create({
        data: {
          userId: trader.id,
          name: "Main Account",
          broker: "Webull",
          accountType: "Margin",
          currency: "USD",
          color: "#3b82f6",
          isDefault: true,
        },
      }),
      prisma.tradingAccount.create({
        data: {
          userId: trader.id,
          name: "Roth IRA",
          broker: "TD Ameritrade",
          accountType: "Roth IRA",
          currency: "USD",
          color: "#10b981",
          isDefault: false,
        },
      }),
      prisma.tradingAccount.create({
        data: {
          userId: trader.id,
          name: "Paper Trading",
          broker: "ThinkorSwim",
          accountType: "Paper Trading",
          currency: "USD",
          color: "#8b5cf6",
          isDefault: false,
        },
      }),
    ]);

    // Main Account — active day-trader, 60% win rate
    await seedTrades(trader.id, mainAccount.id, {
      instruments: ["AAPL", "TSLA", "SPY", "QQQ", "NVDA", "AMD", "MSFT", "META"],
      strategies: ["breakout", "momentum", "scalp", "VWAP-reclaim"],
      count: 45,
      winBias: 0.60,
      avgMove: 0.035,
      maxDaysAgo: 90,
    });

    // Roth IRA — long-term swing trader, 70% win rate, larger moves
    await seedTrades(trader.id, iraAccount.id, {
      instruments: ["SPY", "QQQ", "MSFT", "GOOGL", "AMZN", "BRK.B", "VTI"],
      strategies: ["swing", "trend-follow", "earnings-play", "mean-reversion"],
      count: 20,
      winBias: 0.70,
      avgMove: 0.065,
      maxDaysAgo: 180,
    });

    // Paper Trading — experimental strategies, lower win rate
    await seedTrades(trader.id, paperAccount.id, {
      instruments: ["COIN", "MSTR", "GME", "AMC", "PLTR", "RIVN", "LCID"],
      strategies: ["gap-fill", "reversal", "breakout", "options-play"],
      count: 25,
      winBias: 0.44,
      avgMove: 0.08,
      maxDaysAgo: 60,
    });

    console.log("Seeded 3 trading accounts with demo trades (Main, Roth IRA, Paper)");
  }

  console.log("Seeded: admin@tradingjournal.com and trader@tradingjournal.com (Password123!)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
