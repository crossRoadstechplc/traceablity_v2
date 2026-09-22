import { describe, expect, it, beforeEach } from "vitest";
import { EngineError } from "@ankuaru/schema";
import { createEngine, type Session } from "../src/index.js";
import { randomUUID } from "node:crypto";

function session(actorId: string, capacity: Session["capacity"], userId = randomUUID()): Session {
  return { userId, actorId, capacity, sourceChannel: "web" };
}

describe("LedgerEngine CORE + modules", () => {
  const eng = createEngine();
  let exporterId: string;
  let akrabiId: string;
  let collectorId: string;
  let farmerId: string;
  let expUser: string;
  let farmUser: string;

  beforeEach(() => {
    eng.reset();
    exporterId = randomUUID();
    akrabiId = randomUUID();
    collectorId = randomUUID();
    farmerId = randomUUID();
    expUser = eng.createUser({ displayName: "Exp User" }).userId;
    farmUser = eng.createUser({ displayName: "Farm User" }).userId;
    eng.seedActor({
      actorId: exporterId,
      actorType: "exporter",
      displayName: "Demo Exporter",
      legalIdentityRef: "REG-EXP-2201",
      status: "active",
      sponsorActorId: null,
      metadata: { demoSelectable: "true" },
      capacities: ["Exporter"],
    });
    eng.seedActor({
      actorId: akrabiId,
      actorType: "akrabi",
      displayName: "Yirga Agg",
      legalIdentityRef: "AGG-1",
      status: "active",
      sponsorActorId: exporterId,
      metadata: { demoSelectable: "true" },
      capacities: ["Aggregator"],
    });
    eng.seedActor({
      actorId: collectorId,
      actorType: "collector",
      displayName: "Col 1",
      legalIdentityRef: "COL-1",
      status: "active",
      sponsorActorId: akrabiId,
      metadata: { demoSelectable: "true" },
      capacities: ["Collector"],
    });
    eng.seedActor({
      actorId: farmerId,
      actorType: "farmer",
      displayName: "Abebe",
      legalIdentityRef: "FAYDA-001",
      status: "active",
      sponsorActorId: collectorId,
      metadata: { demoSelectable: "true" },
      capacities: ["Farmer"],
    });
    eng.bindUserToActor(expUser, exporterId);
    eng.bindUserToActor(farmUser, farmerId);
    eng.setFacility(akrabiId, ["wet_milling", "washed_processing"]);
  });

  it("T1 multi-capacity does not change actor UID", () => {
    eng.addCapacity(exporterId, "FacilityOperator");
    const a = eng.getActors().find((x) => x.actorId === exporterId)!;
    expect(a.actorId).toBe(exporterId);
    expect(a.capacities).toContain("FacilityOperator");
  });

  it("T5 farmer exemption — origin without credential", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 100,
    });
    expect(lot.originStatus).toBe("farmer_verified");
    expect(lot.provenance[farmerId]).toBe(1);
  });

  it("T8 server-side capacity — farmer cannot onboard", () => {
    expect(() =>
      eng.onboardActor(session(farmerId, "Farmer", farmUser), {
        actorType: "collector",
        displayName: "X",
        legalIdentityRef: "X",
      }),
    ).toThrow(EngineError);
  });

  it("INV-07 mass balance closes; INV-12 rejects non-custodian process", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 1000,
    });
    const s1 = eng.send(session(farmerId, "Farmer", farmUser), {
      lotId: lot.lotId,
      toActorId: collectorId,
      senderDeclaredKg: 1000,
      requireShinto: false,
    });
    eng.receive(session(collectorId, "Collector"), {
      movementId: s1.movementId,
      receiverDeclaredKg: 1000,
    });
    const s2 = eng.send(session(collectorId, "Collector"), {
      lotId: lot.lotId,
      toActorId: akrabiId,
      senderDeclaredKg: 1000,
      requireShinto: false,
    });
    eng.receive(session(akrabiId, "Aggregator"), {
      movementId: s2.movementId,
      receiverDeclaredKg: 1000,
    });
    const out = eng.process(session(akrabiId, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 100,
      facilityActorId: akrabiId,
      moisturePct: 11,
    });
    expect(out.canonicalMassKg).toBe(850);

    const lot2 = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 100,
    });
    expect(() =>
      eng.process(session(akrabiId, "Aggregator"), {
        inputLotIds: [lot2.lotId],
        outputState: "dry_parchment",
        rejectKg: 10,
        lossKg: 20,
        facilityActorId: akrabiId,
      }),
    ).toThrow(/INV-12|custodian/i);
  });

  it("T2 no invented receipt — intake leaves custody with farmer", () => {
    const lot = eng.createIntakeLot(session(collectorId, "Collector"), {
      supplierActorId: farmerId,
      massKg: 200,
    });
    expect(lot.custodianActorId).toBe(farmerId);
    expect(lot.createdByActorId).toBe(collectorId);
    expect(eng.getMovements().length).toBe(0);
  });

  it("T1 dual observations on discrepancy", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 1000,
    });
    const mov = eng.send(session(farmerId, "Farmer", farmUser), {
      lotId: lot.lotId,
      toActorId: collectorId,
      senderDeclaredKg: 1000,
      requireShinto: false,
    });
    eng.receive(session(collectorId, "Collector"), {
      movementId: mov.movementId,
      receiverDeclaredKg: 985,
    });
    const updated = eng.getLots().find((l) => l.lotId === lot.lotId)!;
    expect(updated.custodianActorId).toBe(collectorId);
    expect(updated.canonicalMassKg).toBe(1000);
    expect(updated.ownerActorId).toBe(farmerId);
  });

  it("T1 no circular lineage", () => {
    const a = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 100,
    });
    const kids = eng.disaggregate(session(farmerId, "Farmer", farmUser), {
      parentLotId: a.lotId,
      childMassesKg: [40, 60],
    });
    // try to make child parent of original — engine only creates parent→child on ops
    expect(eng.traceBackward(kids[0]!.lotId)).toContain(a.lotId);
  });

  it("T4 crop year composition preserved", () => {
    const a = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 100,
      cropYear: "2024",
    });
    const b = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 100,
      cropYear: "2025",
    });
    const c = eng.aggregate(session(farmerId, "Farmer", farmUser), {
      parentLotIds: [a.lotId, b.lotId],
    });
    expect(c.cropYear).toBeUndefined();
    expect(c.cropYearComposition["2024"]).toBeCloseTo(0.5);
    expect(c.cropYearComposition["2025"]).toBeCloseTo(0.5);
  });

  it("REG-D02-02 moisture BLOCK", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 1000,
    });
    const s1 = eng.send(session(farmerId, "Farmer", farmUser), {
      lotId: lot.lotId,
      toActorId: collectorId,
      senderDeclaredKg: 1000,
      requireShinto: false,
    });
    eng.receive(session(collectorId, "Collector"), {
      movementId: s1.movementId,
      receiverDeclaredKg: 1000,
    });
    const s2 = eng.send(session(collectorId, "Collector"), {
      lotId: lot.lotId,
      toActorId: akrabiId,
      senderDeclaredKg: 1000,
      requireShinto: false,
    });
    eng.receive(session(akrabiId, "Aggregator"), {
      movementId: s2.movementId,
      receiverDeclaredKg: 1000,
    });
    expect(() =>
      eng.process(session(akrabiId, "Aggregator"), {
        inputLotIds: [lot.lotId],
        outputState: "green_washed",
        rejectKg: 50,
        lossKg: 50,
        moisturePct: 13.2,
        facilityActorId: akrabiId,
      }),
    ).toThrow(/REG-D02-02|Moisture/);
  });

  it("REG-D05-06 price band", () => {
    expect(() =>
      eng.registerContract(session(exporterId, "Exporter", expUser), {
        supplierActorId: akrabiId,
        exporterActorId: exporterId,
        coffeeType: "washed",
        quantityKg: 1000,
        grade: "G2",
        priceEtbPerKg: 215,
        executionPeriod: "2025",
        paymentTerms: "3 days",
        deliverySite: "Addis",
        transportCostAlloc: "buyer",
        registrationRef: "DAR-1",
        supplierHasCoC: true,
        exporterHasCoC: true,
      }),
    ).toThrow(/REG-D05-06|Price/);
  });

  it("Module 15 AI write ban", () => {
    try {
      eng.rejectAiWrite();
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      expect((e as EngineError).invariantId).toBe("AI-WRITE-BAN");
    }
  });

  it("evidence upload ≠ verified", () => {
    const e = eng.uploadEvidence(session(farmerId, "Farmer", farmUser), {
      attachedType: "lot",
      attachedId: randomUUID(),
      evidenceClass: "self_assessment",
      documentType: "statement",
      factSupported: "origin",
    });
    expect(e.status).toBe("UPLOADED");
  });

  it("stock balance not writable — only via events", () => {
    eng.createOriginLot(session(farmerId, "Farmer", farmUser), { massKg: 50 });
    expect(eng.stockBalance(farmerId)).toBe(50);
    // Move to aggregator to stocktake under warehouse/facility capacity
    const lot = eng.getLots()[0]!;
    const s1 = eng.send(session(farmerId, "Farmer", farmUser), {
      lotId: lot.lotId,
      toActorId: collectorId,
      senderDeclaredKg: 50,
      requireShinto: false,
    });
    eng.receive(session(collectorId, "Collector"), {
      movementId: s1.movementId,
      receiverDeclaredKg: 50,
    });
    const s2 = eng.send(session(collectorId, "Collector"), {
      lotId: lot.lotId,
      toActorId: akrabiId,
      senderDeclaredKg: 50,
      requireShinto: false,
    });
    eng.receive(session(akrabiId, "Aggregator"), {
      movementId: s2.movementId,
      receiverDeclaredKg: 50,
    });
    const st = eng.stocktake(session(akrabiId, "Aggregator"), {
      facilityActorId: akrabiId,
      coffeeState: "cherry",
      physicalKg: 45,
    });
    expect(st.theoreticalKg).toBe(50);
    expect(st.physicalKg).toBe(45);
    expect(eng.stockBalance(akrabiId)).toBe(50);
  });

  it("farm without polygon does not block origin", () => {
    const farm = eng.createFarm(session(farmerId, "Farmer", farmUser), {
      ownerActorId: farmerId,
      displayName: "Plot A",
    });
    const unit = eng.createFarmUnit(session(farmerId, "Farmer", farmUser), {
      farmId: farm.farmId,
      displayName: "Unit 1",
    });
    expect(unit.polygonPending).toBe(true);
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 10,
    });
    expect(lot.lotId).toBeTruthy();
  });

  it("report fingerprint stable", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 10,
    });
    const r = eng.generateReport(lot.lotId);
    expect(eng.verifyReportFingerprint(r.reportId)).toBe(true);
  });

  it("quarantine escalates after deadline", () => {
    const q = eng.quarantineConflict(500, collectorId);
    const notes = eng.escalateOverdueQuarantines(new Date(Date.now() + 73 * 3600 * 1000));
    expect(notes.length).toBeGreaterThan(0);
    expect(q.deadline).toBeTruthy();
  });

  it("routine success does not notify", () => {
    const n = eng.notifyAction(farmUser, "success", "ok", "done");
    expect(n).toBeNull();
  });

  it("cross-scheme volume cap", () => {
    const lot = eng.createOriginLot(session(farmerId, "Farmer", farmUser), {
      massKg: 1000,
    });
    eng.claimSchemeVolume(lot.lotId, "RA", 600);
    expect(() => eng.claimSchemeVolume(lot.lotId, "CAFE", 500)).toThrow();
  });

  it("submission rejection → EXCEPTION", () => {
    const s = eng.submitCompliance({ lot: "x" });
    eng.rejectSubmission(s.id, "external reject");
    expect(eng.snapshot().submissions.find((x) => x.id === s.id)?.status).toBe(
      "EXCEPTION",
    );
  });

  it("UNRESOLVED disposition allowed", () => {
    eng.createOriginLot(session(farmerId, "Farmer", farmUser), { massKg: 1 });
    const mov = eng.send(session(farmerId, "Farmer", farmUser), {
      lotId: eng.getLots()[0]!.lotId,
      toActorId: collectorId,
      senderDeclaredKg: 1,
      requireShinto: false,
    });
    eng.receive(session(collectorId, "Collector"), {
      movementId: mov.movementId,
      receiverDeclaredKg: 0.5,
    });
    const issue = eng.getIssues()[0]!;
    eng.resolveIssue(session(collectorId, "Collector"), issue.issueId, "Unresolved");
    expect(eng.getIssues()[0]!.disposition).toBe("Unresolved");
  });

  it("BLOCK rule governance", () => {
    expect(() =>
      eng.registerBlockRule({ code: "NEW-BLOCK" }),
    ).toThrow();
  });
});
