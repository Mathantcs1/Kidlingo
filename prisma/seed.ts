import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedUserDefaults } from "../src/lib/seed-defaults";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash("Password123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tradingjournal.com" },
    update: {},
    create: {
      email: "admin@tradingjournal.com",
      name: "Admin User",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  await prisma.subscription.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, plan: "PRO", status: "ACTIVE" },
  });

  await seedUserDefaults(admin.id);

  // Create trader user
  const traderPassword = await bcrypt.hash("Password123!", 12);
  const trader = await prisma.user.upsert({
    where: { email: "trader@tradingjournal.com" },
    update: {},
    create: {
      email: "trader@tradingjournal.com",
      name: "Demo Trader",
      password: traderPassword,
      role: "TRADER",
    },
  });

  await prisma.subscription.upsert({
    where: { userId: trader.id },
    update: {},
    create: { userId: trader.id, plan: "BASIC", status: "ACTIVE" },
  });

  await seedUserDefaults(trader.id);

  // Create sample trades for demo trader
  const instruments = ["AAPL", "TSLA", "SPY", "QQQ", "MSFT", "NVDA", "BTC/USD"];
  const strategies = ["breakout", "mean-reversion", "trend-follow", "scalp"];
  const directions: ("LONG" | "SHORT")[] = ["LONG", "SHORT"];

  const existingTrades = await prisma.trade.count({ where: { userId: trader.id } });
  if (existingTrades === 0) {
    for (let i = 0; i < 50; i++) {
      const instrument = instruments[Math.floor(Math.random() * instruments.length)];
      const direction = directions[Math.floor(Math.random() * directions.length)];
      const basePrice = 100 + Math.random() * 400;
      const entryPrice = basePrice;
      const move = (Math.random() - 0.45) * basePrice * 0.05;
      const exitPrice = direction === "LONG" ? entryPrice + move : entryPrice - move;
      const quantity = Math.floor(1 + Math.random() * 100);
      const commission = Math.round(Math.random() * 10 * 100) / 100;
      const pnl = (exitPrice - entryPrice) * quantity * (direction === "LONG" ? 1 : -1) - commission;
      const daysAgo = Math.floor(Math.random() * 90);
      const entryDate = new Date(Date.now() - daysAgo * 86400000);
      const exitDate = new Date(entryDate.getTime() + Math.random() * 3600000 * 8);

      await prisma.trade.create({
        data: {
          userId: trader.id,
          instrument,
          direction,
          entryPrice,
          exitPrice,
          quantity,
          entryDate,
          exitDate,
          strategyTag: strategies[Math.floor(Math.random() * strategies.length)],
          commission,
          pnl: Math.round(pnl * 100) / 100,
          stopLoss: direction === "LONG" ? entryPrice * 0.98 : entryPrice * 1.02,
          takeProfit: direction === "LONG" ? entryPrice * 1.04 : entryPrice * 0.96,
          status: "CLOSED",
        },
      });
    }
  }

  console.log("Seeded: admin@tradingjournal.com and trader@tradingjournal.com (Password123!)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
