/**
 * Seed Supabase with the CORE §11 eight-site world via Prisma.
 * Usage: npm run db:seed
 */
import { seedWorld, serializeSeed } from "@ankuaru/seed";
import { replaceSimulatorWorld, isDatabaseConfigured } from "@ankuaru/db";

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error("Set DATABASE_URL (and preferably DIRECT_URL) before seeding");
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  console.log("Using", url?.replace(/:[^:@]+@/, ":****@"));
  console.log("Seeding in-memory world…");
  const result = seedWorld();
  const data = serializeSeed(result);
  console.log(
    JSON.stringify(
      {
        actors: data.actors.length,
        lots: data.lots.length,
        events: data.events.length,
        preferredTraceLotId: data.preferredTraceLotId,
        integrity: data.integrity,
      },
      null,
      2,
    ),
  );

  await replaceSimulatorWorld(result.engine, {
    preferredTraceLotId: result.preferredTraceLotId,
    clearSessions: true,
    log: console.log,
  });

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
