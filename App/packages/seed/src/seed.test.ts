import { describe, expect, it } from "vitest";
import { seedWorld, serializeSeed } from "./index.js";

describe("seed world", () => {
  const result = seedWorld();
  const eng = result.engine;
  const data = serializeSeed(result);

  it("boots eight sites with the CORE §11 shape", () => {
    expect(result.siteSummaries).toHaveLength(8);
    expect(data.actors.filter((a) => a.actorType === "farmer")).toHaveLength(48);
    expect(data.actors.filter((a) => a.actorType === "akrabi")).toHaveLength(8);
    expect(data.lots.length).toBeGreaterThan(100);
    expect(data.preferredTraceLotId).toBeTruthy();
  });

  it("passes weight balance and traceability integrity (CORE §14.10)", () => {
    const i = eng.integrityChecks();
    expect(i.weightBalance.ok).toBe(true);
    expect(i.traceability.ok).toBe(true);
    expect(i.traceability.untraced).toBe(0);
  });

  it("writes actor_onboarded for every actor and binds a user to each", () => {
    const onboarded = new Set(
      eng
        .getEvents()
        .filter((e) => e.eventType === "actor_onboarded")
        .map((e) => (e.payload.actor as { actorId: string }).actorId),
    );
    for (const a of eng.getActors()) {
      expect(onboarded.has(a.actorId)).toBe(true);
      expect(eng.getUsers().some((u) => u.actorIds.includes(a.actorId))).toBe(true);
    }
  });

  it("puts the seeded discrepancy on the collector→aggregator hop", () => {
    const discrepancies = eng.getDiscrepancies();
    expect(discrepancies).toHaveLength(8);
    for (const d of discrepancies) {
      const m = eng.getMovements().find((x) => x.movementId === d.movementId)!;
      const from = eng.getActors().find((a) => a.actorId === m.fromActorId)!;
      const to = eng.getActors().find((a) => a.actorId === m.toActorId)!;
      expect(from.actorType).toBe("collector");
      expect(to.actorType).toBe("akrabi");
    }
  });

  it("processes at the site facility, never at the aggregator", () => {
    const facilityIds = new Set(result.siteSummaries.map((s) => s.facilityId));
    for (const e of eng.getEvents().filter((x) => x.eventType === "process")) {
      expect(facilityIds.has(String(e.payload.facilityActorId))).toBe(true);
    }
  });

  it("carries a Shinto pass on every green dispatch", () => {
    for (const m of eng.getMovements()) {
      const lot = eng.getLots().find((l) => l.lotId === m.lotId)!;
      if (lot.processingState.startsWith("green_")) {
        expect(m.shinto?.grade).toBeTruthy();
        // seal is checked at receipt; in-transit consignments have not arrived yet
        if (m.state !== "pending") expect(m.shinto?.stationSealIntact).toBe(true);
      }
    }
  });

  it("gives every service role work on day one", () => {
    const carried = eng.getMovements().filter((m) => m.transporterActorId === result.transporterId);
    expect(carried.length).toBeGreaterThan(5);
    expect(carried.some((m) => m.state === "pending")).toBe(true);
    const evidence = eng.getEvidence();
    expect(evidence.some((e) => e.status !== "VERIFIED" && e.status !== "REVOKED")).toBe(true);
    expect(evidence.some((e) => e.status === "REVOKED")).toBe(true);
    expect(eng.getOverlays().length).toBeGreaterThan(0);
    expect(eng.getSanctions().length).toBe(1);
    expect(eng.getRegulatorAccess().length).toBeGreaterThanOrEqual(3);
    expect(eng.getIssues().some((i) => i.raisedByCapacity === "Regulator")).toBe(true);
    expect(eng.getModelRegistry().some((m) => m.enabled)).toBe(true);
    expect(eng.getExternalClaims().some((c) => c.conflict)).toBe(true);
    expect(eng.getStocktakes().length).toBe(2);
  });

  it("has a verifiable hash chain", () => {
    const chain = eng.verifyChain();
    expect(chain.ok).toBe(true);
    expect(chain.legacyUnverifiable).toBe(0);
  });

  it("rebuilds identical module projections from the event log", () => {
    const before = {
      issues: eng.getIssues().length,
      evidence: eng.getEvidence().length,
      contracts: eng.getContracts().length,
      credentials: eng.getCredentials().length,
      assessments: eng.getAssessments().length,
      farms: eng.getFarms().length,
      obligations: eng.getObligations().map((o) => `${o.obligationId}:${o.status}`).sort(),
    };
    eng.rebuildModuleProjections();
    expect(eng.getIssues().length).toBe(before.issues);
    expect(eng.getEvidence().length).toBe(before.evidence);
    expect(eng.getContracts().length).toBe(before.contracts);
    expect(eng.getCredentials().length).toBe(before.credentials);
    expect(eng.getAssessments().length).toBe(before.assessments);
    expect(eng.getFarms().length).toBe(before.farms);
    expect(eng.getObligations().map((o) => `${o.obligationId}:${o.status}`).sort()).toEqual(before.obligations);
  });

  it("assesses the washed blend with a mixed EUDR picture", () => {
    const a = eng.getAssessments(result.preferredTraceLotId);
    expect(a).toHaveLength(1);
    const geo = a[0]!.results.find((r) => r.code === "EUDR-GEO")!;
    expect(geo.status).toBe("READY");
    const dds = a[0]!.results.find((r) => r.code === "EUDR-DDS");
    expect(dds?.status).toBe("READY");
  });
});
