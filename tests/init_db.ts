import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning up database tables...");
  
  // Clear tables
  await prisma.priceAlert.deleteMany({});
  await prisma.trade.deleteMany({});
  await prisma.watchlistItem.deleteMany({});
  await prisma.portfolio.deleteMany({});
  await prisma.backtestResult.deleteMany({});
  await prisma.botConfig.deleteMany({});
  await prisma.aISignal.deleteMany({});

  console.log("🌱 Seeding initial watchlist items...");
  
  const watchlistSymbols = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT"
  ];

  for (const symbol of watchlistSymbols) {
    await prisma.watchlistItem.create({
      data: { symbol }
    });
  }

  console.log(`✅ Database successfully initialized with ${watchlistSymbols.length} watchlist symbols.`);
}

main()
  .catch((e) => {
    console.error("❌ Error initializing database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
