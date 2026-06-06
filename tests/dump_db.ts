import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst();
  const trades = await prisma.trade.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  const output = [
    "=== ACCOUNT SNAPSHOT ===",
    JSON.stringify(account, null, 2),
    "",
    "=== TRADES SNAPSHOT (LAST 10) ===",
    JSON.stringify(trades, null, 2)
  ].join("\n");

  console.log(output);

  const outputPath = "/home/dcorrea/.gemini/antigravity-ide/brain/44b6530d-b50b-4f0c-9276-075b32d99d70/db_snapshot.txt";
  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`\n💾 Snapshot saved to ${outputPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
