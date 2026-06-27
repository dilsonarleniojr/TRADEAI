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

  const artifactDir = process.env.ARTIFACT_DIR || "/home/dcorrea/.gemini/antigravity-ide/brain/b2324724-40b4-4ce4-ae67-d71dc5c5622e";
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
  const outputPath = path.join(artifactDir, "db_snapshot.txt");
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
