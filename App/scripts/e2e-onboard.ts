import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env" });

import {
  ensurePrismaEnginePath,
  getPrisma,
  hydrateEngine,
  syncWorldToDb,
} from "@ankuaru/db";
import type { CapacityCode, LedgerEngine, Session } from "@ankuaru/engine";

ensurePrismaEnginePath();

const CAP: Record<string, CapacityCode> = {
  farmer: "Farmer",
  collector: "Collector",
  akrabi: "Aggregator",
  exporter: "Exporter",
  importer: "Importer",
};

let eng: LedgerEngine;

/** Every command must trace to an identified User bound to the acting Actor (Module 01). */
function sess(actorId: string, capacity: CapacityCode): Session {
  const u = eng.createUser({ displayName: `E2E ${capacity} operator ${randomUUID().slice(0, 4)}` });
  eng.bindUserToActor(u.userId, actorId);
  return {
    userId: u.userId,
    actorId,
    capacity,
    sourceChannel: "web",
  };
}

async function main() {
  console.log("1) Hydrate from DB…");
  const h = await hydrateEngine();
  eng = h.engine;
  console.log("   actors", h.actorCount, "events", h.eventCount);

  const demo = eng
    .getActors()
    .filter(
      (a) =>
        a.metadata.demoSelectable === "true" || a.metadata.userOnboarded === "true",
    );

  console.log("2) Check capacities on demo actors…");
  let bad = 0;
  for (const a of demo) {
    const need = CAP[a.actorType];
    if (!need) continue;
    if (!a.capacities.includes(need)) {
      console.log("   MISSING", a.actorType, a.displayName, a.capacities);
      bad++;
      eng.addCapacity(a.actorId, need);
    } else {
      console.log("   ok", a.actorType, a.displayName, a.capacities.join(","));
    }
  }
  if (bad) {
    console.log("   repaired", bad, "actors in memory; writing capacities to DB…");
    const prisma = getPrisma();
    for (const a of eng.getActors()) {
      if (a.capacities.length === 0) continue;
      await prisma.actorCapacity.createMany({
        data: a.capacities.map((capacity) => ({
          actorId: a.actorId,
          capacity: capacity as never,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log("3) Bind simulation (capacity must be on actor)…");
  for (const type of ["importer", "exporter", "akrabi", "collector", "farmer"] as const) {
    const a = demo.find((x) => x.actorType === type && x.metadata.demoSelectable === "true");
    if (!a) {
      console.log("   skip", type, "(no demoSelectable)");
      continue;
    }
    const cap = CAP[type]!;
    if (!a.capacities.includes(cap)) throw new Error(`bind fail ${type}: no ${cap}`);
    console.log("   bind ok", type, a.displayName);
  }

  let synced = eng.getEvents().length;

  console.log("4a) Onboard importer → exporter…");
  const importer = demo.find((a) => a.actorType === "importer");
  if (!importer) throw new Error("no demo importer — re-run npm run db:seed");
  const seededExporters = eng.networkTree(importer.actorId).filter((a) => a.actorType === "exporter");
  if (seededExporters.length < 3) throw new Error(`expected ≥3 seeded exporters, got ${seededExporters.length}`);
  const exporter = eng.onboardActor(sess(importer.actorId, "Importer"), {
    actorType: "exporter",
    displayName: `E2E Exporter ${Date.now()}`,
    legalIdentityRef: `E2E-EXP-${Date.now()}`,
    metadata: {
      companyName: "E2E Export PLC",
      exportLicense: "E2E-LIC",
      contactPerson: "E2E",
      userOnboarded: "true",
      demoSelectable: "true",
    },
  });
  let r0 = await syncWorldToDb(eng, {
    preferredTraceLotId: h.preferredTraceLotId,
    sinceEventIndex: synced,
  });
  synced = r0.nextEventIndex;
  console.log("   onboarded", exporter.displayName, "eventsWritten", r0.eventsWritten);

  console.log("4b) Onboard exporter → aggregator…");
  const agg = eng.onboardActor(sess(exporter.actorId, "Exporter"), {
    actorType: "akrabi",
    displayName: `E2E Aggregator ${Date.now()}`,
    legalIdentityRef: `E2E-AK-${Date.now()}`,
    metadata: { region: "Sidama", userOnboarded: "true", demoSelectable: "true" },
    facility: {
      capabilities: ["wet_milling", "washed_processing"],
      facilityType: "washing_station",
    },
  });
  let r = await syncWorldToDb(eng, {
    preferredTraceLotId: h.preferredTraceLotId,
    sinceEventIndex: synced,
  });
  synced = r.nextEventIndex;
  console.log("   onboarded", agg.displayName, "eventsWritten", r.eventsWritten);

  console.log("5) Onboard aggregator → collector…");
  const col = eng.onboardActor(sess(agg.actorId, "Aggregator"), {
    actorType: "collector",
    displayName: `E2E Collector ${Date.now()}`,
    legalIdentityRef: `E2E-COL-${Date.now()}`,
    metadata: {
      region: "Sidama",
      phone: "+251900000001",
      coverageArea: "e2e",
      yearsCollecting: "1",
      userOnboarded: "true",
      demoSelectable: "true",
    },
  });
  r = await syncWorldToDb(eng, {
    preferredTraceLotId: h.preferredTraceLotId,
    sinceEventIndex: synced,
  });
  synced = r.nextEventIndex;
  console.log("   onboarded", col.displayName, "eventsWritten", r.eventsWritten);

  console.log("6) Onboard collector → farmer…");
  const farm = eng.onboardActor(sess(col.actorId, "Collector"), {
    actorType: "farmer",
    displayName: `E2E Farmer ${Date.now()}`,
    legalIdentityRef: `E2E-FARM-${Date.now()}`,
    metadata: {
      region: "Sidama",
      kebele: "01",
      farmSizeHa: "1",
      variety: "heirloom",
      yearsFarming: "2",
      userOnboarded: "true",
      demoSelectable: "true",
    },
  });
  r = await syncWorldToDb(eng, {
    preferredTraceLotId: h.preferredTraceLotId,
    sinceEventIndex: synced,
  });
  console.log("   onboarded", farm.displayName, "eventsWritten", r.eventsWritten);

  console.log("7) Re-hydrate and verify actors + capacities…");
  const h2 = await hydrateEngine();
  for (const id of [exporter.actorId, agg.actorId, col.actorId, farm.actorId, importer.actorId]) {
    const a = h2.engine.getActors().find((x) => x.actorId === id);
    if (!a) throw new Error(`missing after hydrate ${id}`);
    if (a.capacities.length === 0) throw new Error(`no capacities after hydrate ${a.displayName}`);
    console.log("   ok", a.actorType, a.displayName, a.capacities.join(","));
  }

  const exp2 = h2.engine.getActors().find((a) => a.actorId === exporter.actorId)!;
  if (!exp2.capacities.includes("Exporter")) {
    throw new Error("Exporter lost Exporter capacity after onboard sync!");
  }
  if (exp2.sponsorActorId !== importer.actorId) {
    throw new Error("Onboarded exporter is not sponsored by the importer after hydrate");
  }
  const imp2 = h2.engine.getActors().find((a) => a.actorId === importer.actorId)!;
  if (!imp2.capacities.includes("Importer")) {
    throw new Error("Importer lost Importer capacity after onboard sync!");
  }

  console.log("\nE2E PASSED");
  await getPrisma().$disconnect();
}

main().catch(async (e) => {
  console.error("\nE2E FAILED", e);
  try {
    await getPrisma().$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
