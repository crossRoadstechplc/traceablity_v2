import { describe, expect, it, beforeEach } from "vitest";
import { EngineError } from "@ankuaru/schema";
import { createEngine, type LedgerEngine, type Session } from "../src/index.js";
import { randomUUID } from "node:crypto";

type Fixture = {
  eng: LedgerEngine;
  ids: Record<
    "admin" | "regulator" | "verifier" | "importer" | "exporter" | "akrabi" | "station" | "collector" | "farmer",
    string
  >;
  s: (actorId: string, capacity: Session["capacity"], extra?: Partial<Session>) => Session;
};

function fixture(): Fixture {
  const eng = createEngine();
  const users = new Map<string, string>();
  const ids = {
    admin: randomUUID(),
    regulator: randomUUID(),
    verifier: randomUUID(),
    importer: randomUUID(),
    exporter: randomUUID(),
    akrabi: randomUUID(),
    station: randomUUID(),
    collector: randomUUID(),
    farmer: randomUUID(),
  };
  const bind = (actorId: string, name: string) => {
    const u = eng.createUser({ displayName: name });
    eng.bindUserToActor(u.userId, actorId);
    users.set(actorId, u.userId);
  };
  const s: Fixture["s"] = (actorId, capacity, extra = {}) => ({
    userId: users.get(actorId) ?? randomUUID(),
    actorId,
    capacity,
    sourceChannel: "web",
    ...extra,
  });
  const actor = (
    key: keyof typeof ids,
    actorType: Parameters<LedgerEngine["seedActor"]>[0]["actorType"],
    capacity: Session["capacity"],
    sponsor: string | null,
    legal: string,
    metadata: Record<string, string> = {},
  ) => {
    eng.seedActor(
      {
        actorId: ids[key],
        actorType,
        displayName: key,
        legalIdentityRef: legal,
        status: "active",
        sponsorActorId: sponsor,
        metadata,
        capacities: [capacity],
      },
      users.has(ids.admin) ? s(ids.admin, "PlatformAdmin") : undefined,
    );
    bind(ids[key], `${key} person`);
  };
  actor("admin", "platform_admin", "PlatformAdmin", null, "ANK-1");
  actor("regulator", "regulator", "Regulator", null, "ECTA-1");
  actor("verifier", "verifier", "Verifier", null, "VER-1");
  actor("importer", "importer", "Importer", null, "IMP-1");
  actor("exporter", "exporter", "Exporter", null, "REG-EXP-2201");
  actor("akrabi", "akrabi", "Aggregator", ids.exporter, "AGG-1");
  actor("station", "washing_station", "FacilityOperator", ids.akrabi, "FAC-1");
  actor("collector", "collector", "Collector", ids.akrabi, "COL-1");
  actor("farmer", "farmer", "Farmer", ids.collector, "FAYDA-001", { farmSizeHa: "1.0" });
  eng.setFacility(ids.station, ["wet_milling", "washed_processing", "dry_milling"]);
  return { eng, ids, s };
}

describe("LedgerEngine CORE + modules", () => {
  let f: Fixture;
  let eng: LedgerEngine;
  let ids: Fixture["ids"];
  let s: Fixture["s"];

  beforeEach(() => {
    f = fixture();
    ({ eng, ids, s } = f);
  });

  /** Origin at the farmer, walked to the aggregator. */
  function cherryAtAggregator(kg = 1000) {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: kg });
    const m1 = eng.send(s(ids.farmer, "Farmer"), { lotId: lot.lotId, toActorId: ids.collector, senderDeclaredKg: kg });
    eng.receive(s(ids.collector, "Collector"), { movementId: m1.movementId, receiverDeclaredKg: kg });
    const m2 = eng.send(s(ids.collector, "Collector"), { lotId: lot.lotId, toActorId: ids.akrabi, senderDeclaredKg: kg });
    eng.receive(s(ids.akrabi, "Aggregator"), { movementId: m2.movementId, receiverDeclaredKg: kg });
    return lot;
  }

  function greenAtAggregator() {
    const lot = cherryAtAggregator(1000);
    const parchment = eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 400,
      facilityActorId: ids.station,
      moisturePct: 11,
    });
    return eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [parchment.lotId],
      outputState: "green_washed",
      rejectKg: 110,
      lossKg: 0,
      facilityActorId: ids.station,
      moisturePct: 11.5,
    });
  }

  it("T1 multi-capacity does not change actor UID", () => {
    eng.addCapacity(ids.exporter, "FacilityOperator");
    const a = eng.getActors().find((x) => x.actorId === ids.exporter)!;
    expect(a.actorId).toBe(ids.exporter);
    expect(a.capacities).toContain("FacilityOperator");
  });

  it("T5 farmer exemption — origin without credential", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 100 });
    expect(lot.originStatus).toBe("farmer_verified");
    expect(lot.provenance[ids.farmer]).toBe(1);
  });

  it("T8 server-side capacity — farmer cannot onboard", () => {
    expect(() =>
      eng.onboardActor(s(ids.farmer, "Farmer"), {
        actorType: "collector",
        displayName: "X",
        legalIdentityRef: "X",
      }),
    ).toThrow(EngineError);
  });

  it("every action traces to a bound User", () => {
    expect(() =>
      eng.createOriginLot({ userId: randomUUID(), actorId: ids.farmer, capacity: "Farmer" }, { massKg: 1 }),
    ).toThrow(/identified User/);
    expect(() =>
      eng.createOriginLot(s(ids.farmer, "Farmer", { userId: f.s(ids.exporter, "Exporter").userId }), { massKg: 1 }),
    ).toThrow(/not bound/);
  });

  it("shared organisational logins are refused", () => {
    expect(() => eng.createUser({ displayName: "Office", email: "info@coop.et" })).toThrow(/Shared/);
  });

  it("onboarding writes actor_onboarded and a facility child with §12 metadata", () => {
    const agg = eng.onboardActor(s(ids.exporter, "Exporter"), {
      actorType: "akrabi",
      displayName: "New Aggregator",
      legalIdentityRef: "REG-AK-NEW",
      metadata: { region: "Sidama" },
      facility: {
        displayName: "New WS",
        facilityType: "washing_station",
        metadata: { kebele: "01", registrationNo: "FAC-9", capacityKgPerDay: "9000", operator: "Ops" },
      },
    });
    expect(agg.capacities).toEqual(["Aggregator"]);
    const ws = eng.getActors().find((a) => a.sponsorActorId === agg.actorId)!;
    expect(ws.actorType).toBe("washing_station");
    expect(ws.metadata.capacityKgPerDay).toBe("9000");
    expect(eng.getEvents().some((e) => e.eventType === "actor_onboarded" && e.affectedObjectIds.includes(agg.actorId))).toBe(true);
    expect(() =>
      eng.onboardActor(s(ids.exporter, "Exporter"), { actorType: "farmer", displayName: "N", legalIdentityRef: "N-1" }),
    ).toThrow(EngineError);
  });

  it("INV-07 mass balance: product is derived and must match when supplied", () => {
    const lot = cherryAtAggregator();
    expect(() =>
      eng.process(s(ids.akrabi, "Aggregator"), {
        inputLotIds: [lot.lotId],
        outputState: "dry_parchment",
        rejectKg: 50,
        lossKg: 400,
        outputMassKg: 600,
        facilityActorId: ids.station,
      }),
    ).toThrow(/Mass balance/);
    const out = eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 400,
      outputMassKg: 550,
      facilityActorId: ids.station,
    });
    expect(out.canonicalMassKg).toBe(550);
    expect(out.createdByActorId).toBe(ids.akrabi);
  });

  it("process is open to farmers and collectors (CORE §10: all four roles)", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 100 });
    const dried = eng.process(s(ids.farmer, "Farmer"), {
      inputLotIds: [lot.lotId],
      outputState: "dried_cherry",
      rejectKg: 5,
      lossKg: 55,
    });
    expect(dried.canonicalMassKg).toBe(40);
  });

  it("FACILITY-CAP blocks a facility without the matching capability", () => {
    eng.setFacility(ids.station, ["wet_milling"]);
    const lot = cherryAtAggregator();
    expect(() =>
      eng.process(s(ids.akrabi, "Aggregator"), {
        inputLotIds: [lot.lotId],
        outputState: "dry_parchment",
        rejectKg: 50,
        lossKg: 400,
        facilityActorId: ids.station,
      }),
    ).toThrow(/FACILITY|capability/i);
  });

  it("yield outside the versioned reference raises a FLAG with its source", () => {
    const lot = cherryAtAggregator();
    eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 700,
      facilityActorId: ids.station,
    });
    const flag = eng.getIssues().find((i) => i.subjectType === "process")!;
    expect(flag.intervention).toBe("FLAG");
    expect(flag.referenceRange?.version).toBe("yield-ref-1.0");
  });

  it("missing moisture on green output is a FLAG, never stored as 0", () => {
    const lot = cherryAtAggregator();
    const p = eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 400,
      facilityActorId: ids.station,
    });
    const g = eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [p.lotId],
      outputState: "green_washed",
      rejectKg: 110,
      lossKg: 0,
      facilityActorId: ids.station,
    });
    expect(g.moisturePct).toBeUndefined();
    expect(eng.getIssues().some((i) => i.ruleRef === "REG-D02-02")).toBe(true);
  });

  it("REG-D02-02 moisture BLOCK", () => {
    const lot = cherryAtAggregator();
    const p = eng.process(s(ids.akrabi, "Aggregator"), {
      inputLotIds: [lot.lotId],
      outputState: "dry_parchment",
      rejectKg: 50,
      lossKg: 400,
      facilityActorId: ids.station,
    });
    expect(() =>
      eng.process(s(ids.akrabi, "Aggregator"), {
        inputLotIds: [p.lotId],
        outputState: "green_washed",
        rejectKg: 110,
        lossKg: 0,
        moisturePct: 13.2,
        facilityActorId: ids.station,
      }),
    ).toThrow(/REG-D02-02|Moisture/);
  });

  it("REG-D05-04 Shinto required for green dispatch; seal check at receipt", () => {
    const green = greenAtAggregator();
    expect(() =>
      eng.send(s(ids.akrabi, "Aggregator"), { lotId: green.lotId, toActorId: ids.exporter, senderDeclaredKg: green.canonicalMassKg }),
    ).toThrow(/Shinto/);
    const m = eng.send(s(ids.akrabi, "Aggregator"), {
      lotId: green.lotId,
      toActorId: ids.exporter,
      senderDeclaredKg: green.canonicalMassKg,
      shinto: { weightKg: green.canonicalMassKg, volumeBags: 8, grade: "G2", sealStatusOrigin: "sealed" },
    });
    expect(() =>
      eng.receive(s(ids.exporter, "Exporter"), { movementId: m.movementId, receiverDeclaredKg: green.canonicalMassKg }),
    ).toThrow(/seal/);
    eng.receive(s(ids.exporter, "Exporter"), {
      movementId: m.movementId,
      receiverDeclaredKg: green.canonicalMassKg,
      stationSealIntact: false,
      transactionChannel: "primary_transaction_center",
    });
    expect(eng.getIssues().some((i) => i.intervention === "WARN" && i.ruleRef === "REG-D05-04")).toBe(true);
  });

  it("transfer ownership: only owner/custodian, only allowed targets", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    expect(() =>
      eng.transferOwnership(s(ids.collector, "Collector"), { lotId: lot.lotId, newOwnerActorId: ids.collector }),
    ).toThrow(/owner or custodian/);
    expect(() =>
      eng.transferOwnership(s(ids.farmer, "Farmer"), { lotId: lot.lotId, newOwnerActorId: ids.exporter }),
    ).toThrow(/target/);
    eng.transferOwnership(s(ids.farmer, "Farmer"), { lotId: lot.lotId, newOwnerActorId: ids.collector });
    expect(eng.getLots().find((l) => l.lotId === lot.lotId)!.ownerActorId).toBe(ids.collector);
  });

  it("close lot: custodian only; domestic needs a measured impurity", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    expect(() =>
      eng.terminalDispose(s(ids.collector, "Collector"), { lotId: lot.lotId, reason: "destroyed" }),
    ).toThrow(/custodian/);
    expect(() =>
      eng.terminalDispose(s(ids.farmer, "Farmer"), { lotId: lot.lotId, reason: "domestic_disposition" }),
    ).toThrow(/impurity/);
    eng.terminalDispose(s(ids.farmer, "Farmer"), { lotId: lot.lotId, reason: "domestic_disposition", impurityPct: 4 });
  });

  it("T2 no invented receipt — intake leaves custody with farmer", () => {
    const lot = eng.createIntakeLot(s(ids.collector, "Collector"), { supplierActorId: ids.farmer, massKg: 200 });
    expect(lot.custodianActorId).toBe(ids.farmer);
    expect(lot.createdByActorId).toBe(ids.collector);
    expect(eng.getMovements().length).toBe(0);
  });

  it("T1 dual observations; parties dispose the discrepancy (Unresolved allowed)", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 1000 });
    const mov = eng.send(s(ids.farmer, "Farmer"), { lotId: lot.lotId, toActorId: ids.collector, senderDeclaredKg: 1000 });
    eng.receive(s(ids.collector, "Collector"), { movementId: mov.movementId, receiverDeclaredKg: 985 });
    const updated = eng.getLots().find((l) => l.lotId === lot.lotId)!;
    expect(updated.canonicalMassKg).toBe(1000);
    expect(updated.ownerActorId).toBe(ids.farmer);
    expect(() =>
      eng.resolveDiscrepancy(s(ids.exporter, "Exporter"), { movementId: mov.movementId, disposition: "Accepted" }),
    ).toThrow(/parties/);
    eng.resolveDiscrepancy(s(ids.collector, "Collector"), { movementId: mov.movementId, disposition: "Unresolved" });
    expect(eng.getDiscrepancies()[0]!.status).toBe("resolved");
    expect(eng.getIssues()[0]!.disposition).toBe("Unresolved");
  });

  it("T1 no circular lineage", () => {
    const a = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 100 });
    const kids = eng.disaggregate(s(ids.farmer, "Farmer"), { parentLotId: a.lotId, childMassesKg: [40, 60] });
    expect(eng.traceBackward(kids[0]!.lotId)).toContain(a.lotId);
    const node = eng.lineageTrace(kids[0]!.lotId).nodes.find((n) => n.lotId === kids[0]!.lotId)!;
    expect(node.summary.startsWith("Split from a larger lot")).toBe(true);
  });

  it("T4 crop year composition preserved", () => {
    const a = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 100, cropYear: "2024" });
    const b = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 100, cropYear: "2025" });
    const c = eng.aggregate(s(ids.farmer, "Farmer"), { parentLotIds: [a.lotId, b.lotId] });
    expect(c.cropYear).toBeUndefined();
    expect(c.cropYearComposition["2024"]).toBeCloseTo(0.5);
  });

  it("REG-D05-06 price band and CoC from issued credentials", () => {
    const terms = {
      supplierActorId: ids.akrabi,
      exporterActorId: ids.exporter,
      coffeeType: "washed",
      quantityKg: 1000,
      grade: "G2",
      priceEtbPerKg: 190,
      executionPeriod: "2025",
      paymentTerms: "3 days",
      deliverySite: "Addis",
      transportCostAlloc: "buyer",
      registrationRef: "DAR-1",
    };
    expect(() => eng.registerContract(s(ids.exporter, "Exporter"), terms)).toThrow(/Competency/);
    const window = { validFrom: new Date().toISOString(), validTo: new Date(Date.now() + 9e9).toISOString() };
    const all = { infrastructure: true, personnel: true, labAccess: true, taxLegal: true };
    eng.issueCredential(s(ids.regulator, "Regulator"), { actorId: ids.exporter, kind: "federal_coc", criteria: all, ...window });
    const partial = eng.issueCredential(s(ids.regulator, "Regulator"), {
      actorId: ids.akrabi,
      kind: "federal_coc",
      criteria: { infrastructure: true },
      ...window,
    });
    expect(partial.status).toBe("INCOMPLETE");
    expect(() => eng.registerContract(s(ids.exporter, "Exporter"), terms)).toThrow(/Competency/);
    eng.issueCredential(s(ids.regulator, "Regulator"), { actorId: ids.akrabi, kind: "federal_coc", criteria: all, ...window });
    expect(() => eng.registerContract(s(ids.exporter, "Exporter"), { ...terms, priceEtbPerKg: 215 })).toThrow(/Price/);
    expect(eng.registerContract(s(ids.exporter, "Exporter"), terms).contractId).toBeTruthy();
  });

  it("Module 15 AI write ban at the write path", () => {
    expect(() =>
      eng.createOriginLot(s(ids.farmer, "Farmer", { agentKind: "ai_model" }), { massKg: 1 }),
    ).toThrow(/AI/);
    try {
      eng.rejectAiWrite();
      expect.fail("should throw");
    } catch (e) {
      expect((e as EngineError).invariantId).toBe("AI-WRITE-BAN");
    }
  });

  it("idempotent client event id: replay is rejected, not double-applied", () => {
    const id = randomUUID();
    eng.withClientEventId(id, () => eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 5 }));
    expect(eng.hasEvent(id)).toBe(true);
    expect(() =>
      eng.withClientEventId(id, () => eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 5 })),
    ).toThrow(/DUPLICATE|already/);
    expect(eng.getLots()).toHaveLength(1);
  });

  it("offline capture keeps actual time separate and flags retrospective", () => {
    const actual = "2026-01-02T08:00:00.000Z";
    eng.createOriginLot(s(ids.farmer, "Farmer", { sourceChannel: "mobile_offline_sync", eventTimeActual: actual }), { massKg: 5 });
    const ev = eng.getEvents().find((e) => e.eventType === "origin_lot_created")!;
    expect(ev.eventTimeActual).toBe(actual);
    expect(ev.retrospectiveFlag).toBe(true);
    expect(ev.serverCommitTime).not.toBe(actual);
  });

  it("assisted entry records who entered it", () => {
    const u = eng.createUser({ displayName: "collector clerk" });
    eng.bindUserToActor(u.userId, ids.collector);
    eng.createOriginLot({ userId: u.userId, actorId: ids.farmer, capacity: "Farmer", assistedByActorId: ids.collector }, { massKg: 5 });
    const ev = eng.getEvents().find((e) => e.eventType === "origin_lot_created")!;
    expect(ev.payload.enteredByActorId).toBe(ids.collector);
  });

  it("hash chain detects a tampered payload", () => {
    eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 5 });
    expect(eng.verifyChain().ok).toBe(true);
    const ev = eng.snapshot().events.find((e) => e.eventType === "origin_lot_created")!;
    ev.payload.massKg = 6;
    const v = eng.verifyChain();
    expect(v.ok).toBe(false);
    expect(v.mismatches[0]!.eventId).toBe(ev.eventId);
  });

  it("evidence: upload ≠ verified; uploader cannot self-verify; revocation not retroactive", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 5 });
    const e = eng.uploadEvidence(s(ids.farmer, "Farmer"), {
      attachedType: "lot",
      attachedId: lot.lotId,
      evidenceClass: "self_assessment",
      documentType: "statement",
      factSupported: "origin",
    });
    expect(e.status).toBe("SYSTEM_VALIDATED");
    eng.verifyEvidence(s(ids.verifier, "Verifier"), e.evidenceId);
    expect(eng.getEvidence()[0]!.status).toBe("VERIFIED");
    const eff = new Date(Date.now() + 3600e3).toISOString();
    eng.revokeEvidence(s(ids.verifier, "Verifier"), e.evidenceId, eff, "issuer withdrew");
    expect(eng.evidenceValidAt(e.evidenceId, new Date().toISOString())).toBe(true);
    expect(eng.evidenceValidAt(e.evidenceId, new Date(Date.now() + 7200e3).toISOString())).toBe(false);
    expect(eng.getNotifications(ids.farmer).some((n) => n.category === "evidence_invalid")).toBe(true);
  });

  it("stocktake records variance, never rewrites stock", () => {
    const lot = cherryAtAggregator(50);
    const st = eng.stocktake(s(ids.akrabi, "Aggregator"), { coffeeState: "cherry", physicalKg: 45 });
    expect(st.theoreticalKg).toBe(50);
    expect(st.varianceKg).toBe(-5);
    expect(eng.stockBalance(ids.akrabi)).toBe(50);
    expect(lot.canonicalMassKg).toBe(50);
  });

  it("geometry: self-intersection flagged; farm without polygon does not block origin", () => {
    const farm = eng.createFarm(s(ids.farmer, "Farmer"), { ownerActorId: ids.farmer, displayName: "Plot A" });
    const unit = eng.createFarmUnit(s(ids.farmer, "Farmer"), { farmId: farm.farmId, displayName: "Unit 1" });
    expect(unit.polygonPending).toBe(true);
    const bowtie = { type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
    const g = eng.addGeometryVersion(s(ids.farmer, "Farmer"), { farmUnitId: unit.farmUnitId, geojson: bowtie });
    expect(g.anomalyFlags).toContain("self_intersection");
    expect(eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 }).lotId).toBeTruthy();
  });

  it("reports are fingerprinted and superseded on regeneration", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    const r1 = eng.generateReport(s(ids.farmer, "Farmer"), lot.lotId);
    expect(eng.verifyReportFingerprint(r1.reportId)).toBe(true);
    const r2 = eng.generateReport(s(ids.farmer, "Farmer"), lot.lotId);
    expect(eng.getReports(lot.lotId).find((r) => r.reportId === r1.reportId)!.supersededByReportId).toBe(r2.reportId);
    expect(r2.supersedesReportId).toBe(r1.reportId);
  });

  it("quarantine escalates to the sponsor after 72h", () => {
    eng.quarantineConflict(s(ids.collector, "Collector"), {
      quantityKg: 500,
      accountableActorId: ids.collector,
      reason: "offline sync conflict",
    });
    const notes = eng.escalateOverdueQuarantines(new Date(Date.now() + 73 * 3600 * 1000));
    expect(notes.length).toBeGreaterThan(0);
    expect(eng.getObligations()[0]!.accountableActorId).toBe(ids.akrabi);
  });

  it("sweep marks receipts overdue after 72h and notifies", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    eng.send(s(ids.farmer, "Farmer"), { lotId: lot.lotId, toActorId: ids.collector, senderDeclaredKg: 10 });
    expect(eng.getNotifications(ids.collector).some((n) => n.category === "required_receipt")).toBe(true);
    const r = eng.sweep(new Date(Date.now() + 73 * 3600 * 1000));
    expect(r.overdue).toBe(1);
    expect(eng.getMovements()[0]!.state).toBe("receipt_overdue");
  });

  it("routine success does not notify", () => {
    expect(eng.notifyAction(ids.farmer, "success", "ok", "done")).toBeNull();
  });

  it("cross-scheme volume cap", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 1000 });
    eng.claimSchemeVolume(s(ids.exporter, "Exporter"), { lotId: lot.lotId, scheme: "RA", claimedKg: 600 });
    expect(() =>
      eng.claimSchemeVolume(s(ids.exporter, "Exporter"), { lotId: lot.lotId, scheme: "CAFE", claimedKg: 500 }),
    ).toThrow();
  });

  it("compliance: INCOMPLETE cannot be submitted; external rejection → EXCEPTION with both determinations", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    const a = eng.assessLotCompliance(s(ids.regulator, "Regulator"), { lotId: lot.lotId, frameworkCode: "EUDR", market: "EU" });
    expect(a.results.find((r) => r.code === "EUDR-GEO")!.status).toBe("INCOMPLETE");
    const us = eng.assessLotCompliance(s(ids.regulator, "Regulator"), { lotId: lot.lotId, frameworkCode: "EUDR", market: "US" });
    expect(us.results.every((r) => r.status === "NOT_APPLICABLE")).toBe(true);
    const farm = eng.createFarm(s(ids.farmer, "Farmer"), { ownerActorId: ids.farmer, displayName: "P", pointLat: 6, pointLng: 38 });
    eng.createFarmUnit(s(ids.farmer, "Farmer"), { farmId: farm.farmId, displayName: "U" });
    const ok = eng.assessLotCompliance(s(ids.regulator, "Regulator"), {
      lotId: lot.lotId,
      frameworkCode: "EUDR",
      market: "EU",
      atEventTime: "2024-06-01T00:00:00.000Z",
    });
    expect(ok.frameworkVersion).toBe("1");
    expect(ok.results.find((r) => r.code === "EUDR-GEO")!.status).toBe("READY");
    expect(() => eng.submitCompliance(s(ids.exporter, "Exporter"), { assessmentId: a.assessmentId, recipient: "EU TRACES" })).toThrow(
      /Cannot submit/,
    );
    const sub = eng.submitCompliance(s(ids.exporter, "Exporter"), { assessmentId: ok.assessmentId, recipient: "EU TRACES" });
    eng.recordSubmissionOutcome(s(ids.exporter, "Exporter"), { submissionId: sub.submissionId, outcome: "REJECTED", reason: "geo mismatch" });
    const after = eng.getSubmissions()[0]!;
    expect(after.status).toBe("EXCEPTION");
    expect(after.discrepancy?.externalReason).toBe("geo mismatch");
  });

  it("issue authority: parties cannot resolve legal issues; exceptions need rule + evidence", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    const dispute = eng.raiseGradingDispute(s(ids.farmer, "Farmer"), { lotId: lot.lotId, assignedGrade: "G4", claimedGrade: "G2" });
    expect(() =>
      eng.transitionIssue(s(ids.farmer, "Farmer"), { issueId: dispute.issueId, to: "RESOLVED", disposition: "Resolved" }),
    ).toThrow(/authority/);
    expect(eng.getEvents().some((e) => e.eventType === "issue_resolution_rejected")).toBe(true);
    const own = eng.raiseIssue(s(ids.farmer, "Farmer"), { intervention: "FLAG", subjectType: "lot", subjectId: lot.lotId, summary: "odd", lotIds: [lot.lotId] });
    expect(() =>
      eng.transitionIssue(s(ids.farmer, "Farmer"), { issueId: own.issueId, to: "CONFIRMED_EXCEPTION" }),
    ).toThrow(/rule reference/);
    eng.transitionIssue(s(ids.regulator, "Regulator"), { issueId: dispute.issueId, to: "RESOLVED", disposition: "Unresolved" });
  });

  it("obligation handover only by the accountable actor", () => {
    eng.quarantineConflict(s(ids.collector, "Collector"), { quantityKg: 5, accountableActorId: ids.collector, reason: "conflict" });
    const ob = eng.getObligations()[0]!;
    expect(() =>
      eng.handoverObligation(s(ids.akrabi, "Aggregator"), { obligationId: ob.obligationId, toActorId: ids.akrabi, reason: "x" }),
    ).toThrow(/accountable/);
    eng.handoverObligation(s(ids.collector, "Collector"), { obligationId: ob.obligationId, toActorId: ids.akrabi, reason: "shift change" });
    expect(eng.getObligations()[0]!.accountableActorId).toBe(ids.akrabi);
  });

  it("sanction ladder: no skipping; suspension blocks new actions", () => {
    expect(() =>
      eng.recordSanction(s(ids.regulator, "Regulator"), { actorId: ids.collector, step: "certificate_suspension", reason: "x" }),
    ).toThrow(/ladder/);
    eng.recordSanction(s(ids.regulator, "Regulator"), { actorId: ids.collector, step: "written_warning", reason: "late reporting" });
    eng.recordSanction(s(ids.regulator, "Regulator"), { actorId: ids.collector, step: "certificate_suspension", reason: "repeat" });
    expect(() => eng.createIntakeLot(s(ids.collector, "Collector"), { supplierActorId: ids.farmer, massKg: 1 })).toThrow(/sanction/);
  });

  it("external claim conflict is a FLAG and never overwrites the ledger", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    const c = eng.ingestExternalClaim(s(ids.admin, "PlatformAdmin", { agentKind: "integration" }), {
      source: "ECX",
      lotId: lot.lotId,
      field: "massKg",
      claimedValue: 12,
    });
    expect(c.conflict).toBe(true);
    expect(eng.getLots()[0]!.canonicalMassKg).toBe(10);
    expect(eng.getIssues().some((i) => i.summary.includes("ECX"))).toBe(true);
  });

  it("model registry requires completeness before enablement", () => {
    expect(() =>
      eng.registerModel(s(ids.admin, "PlatformAdmin"), {
        modelId: "yield-anomaly",
        purpose: "flag",
        owner: "",
        trainingData: "",
        features: "",
        version: "1",
        performance: "",
        limitations: "",
        deploymentScope: "",
        monitoringPlan: "",
        retirementPath: "",
      }),
    ).toThrow(/incomplete/);
  });

  it("BLOCK rule governance needs step-up and full provenance", () => {
    expect(() => eng.registerBlockRule(s(ids.admin, "PlatformAdmin"), { code: "NEW-BLOCK" })).toThrow(/Re-authentication/);
    expect(() =>
      eng.registerBlockRule(s(ids.admin, "PlatformAdmin"), { code: "NEW-BLOCK", stepUpProof: "ANK-1" }),
    ).toThrow(/requires/);
    expect(() =>
      eng.registerBlockRule(s(ids.admin, "PlatformAdmin"), {
        code: "BENCH",
        authorityTag: "INDUSTRY_BENCHMARK",
        sourceRef: "x",
        scope: "x",
        owner: "x",
        approvalRef: "x",
        stepUpProof: "ANK-1",
      }),
    ).toThrow(/WARN\/FLAG/);
  });

  it("§9 event visibility: executor or payload farmer only", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 10 });
    const m = eng.send(s(ids.farmer, "Farmer"), { lotId: lot.lotId, toActorId: ids.collector, senderDeclaredKg: 10 });
    eng.receive(s(ids.collector, "Collector"), { movementId: m.movementId, receiverDeclaredKg: 10 });
    const collectorSees = eng.visibleEvents(ids.collector).map((e) => e.eventType);
    expect(collectorSees).toContain("movement_receive");
    expect(collectorSees).not.toContain("movement_send");
    expect(eng.visibleEvents(ids.regulator).length).toBe(eng.getEvents().length);
  });

  it("module projections survive a rebuild from events", () => {
    const lot = eng.createOriginLot(s(ids.farmer, "Farmer"), { massKg: 1000 });
    const mov = eng.send(s(ids.farmer, "Farmer"), { lotId: lot.lotId, toActorId: ids.collector, senderDeclaredKg: 1000 });
    eng.receive(s(ids.collector, "Collector"), { movementId: mov.movementId, receiverDeclaredKg: 990 });
    eng.uploadEvidence(s(ids.farmer, "Farmer"), {
      attachedType: "lot",
      attachedId: lot.lotId,
      evidenceClass: "self_assessment",
      documentType: "statement",
      factSupported: "origin",
    });
    const before = { issues: eng.getIssues().length, evidence: eng.getEvidence().length };
    eng.rebuildModuleProjections();
    expect(eng.getIssues().length).toBe(before.issues);
    expect(eng.getEvidence().length).toBe(before.evidence);
  });

  describe("§2 importer above exporters", () => {
    const as = (actorId: string, capacity: Session["capacity"]): Session => {
      const u = eng.createUser({ displayName: `${capacity} person` });
      eng.bindUserToActor(u.userId, actorId);
      return { userId: u.userId, actorId, capacity, sourceChannel: "web" };
    };

    function sponsoredExporter(name = "Exporter B") {
      return eng.onboardActor(s(ids.importer, "Importer"), {
        actorType: "exporter",
        displayName: name,
        legalIdentityRef: `REG-EXP-${randomUUID().slice(0, 6)}`,
        metadata: { companyName: `${name} PLC` },
      });
    }

    it("importer onboards exporters; cannot skip to aggregator", () => {
      const exp = sponsoredExporter();
      expect(exp.sponsorActorId).toBe(ids.importer);
      expect(exp.capacities).toContain("Exporter");
      expect(() =>
        eng.onboardActor(s(ids.importer, "Importer"), {
          actorType: "akrabi",
          displayName: "Skip",
          legalIdentityRef: "SKIP-1",
        }),
      ).toThrow(/may not onboard/);
      expect(eng.networkCounts(ids.importer).exporters).toBe(1);
    });

    it("exporter sends to sponsor importer; importer sends back; intake from sponsored exporter", () => {
      const exp = sponsoredExporter();
      const agg = eng.onboardActor(as(exp.actorId, "Exporter"), {
        actorType: "akrabi",
        displayName: "Agg B",
        legalIdentityRef: "AGG-B",
      });
      const col = eng.onboardActor(as(agg.actorId, "Aggregator"), {
        actorType: "collector",
        displayName: "Col B",
        legalIdentityRef: "COL-B",
      });
      eng.onboardActor(as(col.actorId, "Collector"), {
        actorType: "farmer",
        displayName: "Farmer B",
        legalIdentityRef: "FARM-B",
      });

      expect(eng.allowedSendTargets(exp.actorId).map((t) => t.actorId)).toContain(ids.importer);
      expect(eng.allowedSendTargets(ids.importer).map((t) => t.actorId)).toEqual([exp.actorId]);
      // Unsponsored exporter cannot ship to this importer
      expect(eng.allowedSendTargets(ids.exporter).map((t) => t.actorId)).not.toContain(ids.importer);

      const lot = eng.createIntakeLot(s(ids.importer, "Importer"), {
        supplierActorId: exp.actorId,
        massKg: 600,
      });
      expect(lot.processingState).toBe("green_washed");
      expect(lot.createdByActorId).toBe(ids.importer);
      expect(() =>
        eng.createIntakeLot(s(ids.importer, "Importer"), { supplierActorId: ids.exporter, massKg: 10 }),
      ).toThrow(/sponsored network/);
    });

    it("sibling exporters are numbered for the importer", () => {
      const a = sponsoredExporter("Exp A");
      const b = sponsoredExporter("Exp B");
      expect(eng.displayNameFor(ids.importer, a.actorId)).toBe("Exporter 1 · Exp A");
      expect(eng.displayNameFor(ids.importer, b.actorId)).toBe("Exporter 2 · Exp B");
      expect(eng.displayNameFor(b.actorId, b.actorId)).toBe("Exp B");
    });
  });
});
