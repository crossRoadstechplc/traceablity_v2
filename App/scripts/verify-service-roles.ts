import { config } from "dotenv";
config({ path: ".env" });

import { ensurePrismaEnginePath, getPrisma, hydrateEngine } from "@ankuaru/db";

ensurePrismaEnginePath();

/** After `npm run db:seed`: every service / oversight role must have demo work once hydrated from the DB. */
async function main() {
  const { engine: eng } = await hydrateEngine();
  const byType = (t: string) => eng.getActors().find((a) => a.actorType === t)!;
  const transporter = byType("transporter");
  const carried = eng.getMovements().filter((m) => m.transporterActorId === transporter.actorId);
  const evidence = eng.getEvidence();
  const checks: Array<[string, boolean, string]> = [
    ["transporter carries consignments", carried.length > 5, `${carried.length}`],
    ["transporter has one in transit", carried.some((m) => m.state === "pending"), `${carried.filter((m) => m.state === "pending").length}`],
    ["verifier queue non-empty", evidence.some((e) => e.status === "UPLOADED" || e.status === "SYSTEM_VALIDATED"), `${evidence.length} evidence`],
    ["revoked evidence present", evidence.some((e) => e.status === "REVOKED"), ""],
    ["overlays recorded", eng.getOverlays().length > 0, `${eng.getOverlays().length}`],
    ["regulator sanction", eng.getSanctions().length === 1, ""],
    ["regulator access log", eng.getRegulatorAccess().length >= 3, `${eng.getRegulatorAccess().length}`],
    ["regulator investigation", eng.getIssues().some((i) => i.raisedByCapacity === "Regulator"), ""],
    ["facility flag", eng.getIssues().some((i) => i.raisedByCapacity === "FacilityOperator"), ""],
    ["stocktakes", eng.getStocktakes().length === 2, `${eng.getStocktakes().length}`],
    ["model enabled", eng.getModelRegistry().some((m) => m.enabled), `${eng.getModelRegistry().length} models`],
    ["external claim conflict", eng.getExternalClaims().some((c) => c.conflict), ""],
  ];
  let bad = 0;
  for (const [name, ok, detail] of checks) {
    console.log(ok ? "ok  " : "FAIL", name, detail);
    if (!ok) bad++;
  }
  await getPrisma().$disconnect();
  if (bad) process.exit(1);
  console.log("SERVICE ROLES OK");
}

void main();
