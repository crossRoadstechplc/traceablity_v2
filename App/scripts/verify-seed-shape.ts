/**
 * In-memory check of the seeded chain: Importer → 3 Exporters → sites.
 * Usage: npx tsx scripts/verify-seed-shape.ts
 */
import { seedWorld } from "@ankuaru/seed";

const r = seedWorld();
const e = r.engine;
const actor = (id: string) => e.getActors().find((a) => a.actorId === id)!;
const inv = (id: string) =>
  e.getLots().filter((l) => l.status === "active" && l.custodianActorId === id && !l.inTransit).length;

let ok = true;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) ok = false;
};

const importer = actor(r.importerId);
check(importer.sponsorActorId === null, "importer is chain root");
check(r.exporterIds.length === 3, "three exporters seeded");
check(e.networkTree(r.importerId).filter((a) => a.actorType === "exporter").length === 3, "importer sponsors 3 exporters");
check(inv(r.importerId) > 0, `importer has inventory (${inv(r.importerId)})`);
check(e.allowedIntakeTargets(r.importerId).length === 3, "importer intake targets = 3 exporters");
check(e.allowedSendTargets(r.importerId).length === 3, "importer send-back targets = 3 exporters");

const siteSplit = [3, 3, 2];
r.exporterIds.forEach((id, i) => {
  const aggs = e.networkTree(id).filter((a) => a.actorType === "akrabi").length;
  check(aggs === siteSplit[i], `${actor(id).displayName}: ${aggs} aggregators`);
  check(inv(id) > 0, `${actor(id).displayName}: inventory ${inv(id)}`);
  check(
    e.allowedSendTargets(id).some((t) => t.actorId === r.importerId),
    `${actor(id).displayName}: can send to sponsor importer`,
  );
});

check(!!r.preferredTraceLotId, "preferred trace blend exists");
if (r.preferredTraceLotId) {
  const farms = e.farmCountForLot(r.preferredTraceLotId);
  check(farms > 6, `preferred blend traces to ${farms} farms`);
}
const integ = e.integrityChecks();
check(integ.traceability.ok && integ.weightBalance.ok, "integrity: traceability + weight balance");
check(
  e.displayNameFor(r.importerId, r.exporterIds[1]!).startsWith("Exporter "),
  `privacy label: ${e.displayNameFor(r.importerId, r.exporterIds[1]!)}`,
);
const playable = new Set(
  e.getActors().filter((a) => a.metadata.demoSelectable === "true").map((a) => a.actorType),
);
for (const t of ["farmer", "collector", "akrabi", "exporter", "importer"]) {
  check(playable.has(t), `demo-selectable ${t}`);
}

console.log(ok ? "SEED SHAPE OK" : "SEED SHAPE FAILED");
process.exit(ok ? 0 : 1);
