import { seedWorld } from "@ankuaru/seed";

const { engine } = seedWorld();
const byType: Record<string, number[]> = {};
for (const a of engine.getActors()) {
  if (a.metadata.demoSelectable !== "true") continue;
  const n = engine.inventory(a.actorId).length;
  (byType[a.actorType] ??= []).push(n);
  console.log(`${a.actorType.padEnd(12)} ${a.displayName.padEnd(28)} lots=${n}`);
}
console.log("---");
for (const [t, counts] of Object.entries(byType)) {
  console.log(t, "min", Math.min(...counts), "max", Math.max(...counts));
}
