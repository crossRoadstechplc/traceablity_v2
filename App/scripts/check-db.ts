import { config } from "dotenv";
config({ path: ".env" });
import { PrismaClient } from "@prisma/client";

async function tryUrl(label: string, url: string | undefined) {
  if (!url) {
    console.log(label, "missing");
    return;
  }
  console.log(label, url.replace(/:[^:@]+@/, ":****@").slice(0, 100));
  const p = new PrismaClient({ datasources: { db: { url } } });
  const t0 = Date.now();
  try {
    await p.$queryRaw`SELECT 1 as ok`;
    console.log(label, "OK", Date.now() - t0, "ms");
  } catch (e) {
    console.log(label, "FAIL", Date.now() - t0, "ms");
    console.log(" ", (e as Error).message.split("\n")[0]);
  } finally {
    await p.$disconnect();
  }
}

async function main() {
  await tryUrl("DIRECT", process.env.DIRECT_URL);
  await tryUrl("POOL", process.env.DATABASE_URL);
}

main();
