import { hydrateEngine, replaceSimulatorWorld, dbHasSimulatorData } from "@ankuaru/db";

async function main() {
  console.log("dbHasSimulatorData", await dbHasSimulatorData());
  const h1 = await hydrateEngine();
  console.log("hydrate1", {
    actors: h1.actorCount,
    events: h1.eventCount,
    preferred: h1.preferredTraceLotId,
  });
  const exporter = h1.engine
    .getActors()
    .find((a) => a.actorType === "exporter" && a.metadata.demoSelectable === "true");
  if (!exporter) throw new Error("no exporter");
  const user = h1.engine.createUser({ displayName: "Roundtrip Exporter" });
  h1.engine.bindUserToActor(user.userId, exporter.actorId);
  const sess = {
    userId: user.userId,
    actorId: exporter.actorId,
    capacity: "Exporter" as const,
    sourceChannel: "web" as const,
  };
  const onboarded = h1.engine.onboardActor(sess, {
    actorType: "akrabi",
    displayName: "Roundtrip Aggregator XYZ",
    legalIdentityRef: "RT-AGG-" + Date.now(),
    sponsorActorId: exporter.actorId,
    metadata: { userOnboarded: "true", demoSelectable: "true" },
    capacities: ["Aggregator"],
  });
  console.log("onboarded", onboarded.actorId, onboarded.displayName);
  await replaceSimulatorWorld(h1.engine, {
    preferredTraceLotId: h1.preferredTraceLotId,
    log: () => {},
  });
  const h2 = await hydrateEngine();
  const found = h2.engine.getActors().find((a) => a.actorId === onboarded.actorId);
  if (!found) throw new Error("onboarded actor missing after hydrate");
  console.log("roundtrip OK", found.displayName, "actors", h2.actorCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
