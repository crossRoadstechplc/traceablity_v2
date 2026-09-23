import { randomUUID } from "node:crypto";
import {
  createEngine,
  type LedgerEngine,
  type Session,
} from "@ankuaru/engine";

const SITES = [
  {
    name: "Yirgacheffe",
    route: "washed" as const,
    facility: "washing_station" as const,
    region: "South Ethiopia",
    zone: "Gedeo",
    woreda: "Yirgacheffe",
  },
  {
    name: "Bensa",
    route: "natural" as const,
    facility: "mill" as const,
    region: "Sidama",
    zone: "Bensa",
    woreda: "Bensa",
  },
  {
    name: "Yirgalem",
    route: "washed" as const,
    facility: "washing_station" as const,
    region: "Sidama",
    zone: "Dale",
    woreda: "Yirgalem",
  },
  {
    name: "Kochere",
    route: "washed" as const,
    facility: "washing_station" as const,
    region: "South Ethiopia",
    zone: "Gedeo",
    woreda: "Kochere",
  },
  {
    name: "Hambela",
    route: "natural" as const,
    facility: "mill" as const,
    region: "Oromia",
    zone: "Guji",
    woreda: "Hambela Wamena",
  },
  {
    name: "Aleta Wondo",
    route: "washed" as const,
    facility: "washing_station" as const,
    region: "Sidama",
    zone: "Aleta Wondo",
    woreda: "Aleta Wondo",
  },
  {
    name: "Dilla",
    route: "washed" as const,
    facility: "washing_station" as const,
    region: "South Ethiopia",
    zone: "Gedeo",
    woreda: "Dilla Zuria",
  },
  {
    name: "Shakiso",
    route: "natural" as const,
    facility: "mill" as const,
    region: "Oromia",
    zone: "Guji",
    woreda: "Shakiso",
  },
];

function sess(actorId: string, capacity: Session["capacity"]): Session {
  return {
    userId: randomUUID(),
    actorId,
    capacity,
    sourceChannel: "api",
  };
}

function hop(
  eng: LedgerEngine,
  lotId: string,
  fromId: string,
  fromCap: Session["capacity"],
  toId: string,
  toCap: Session["capacity"],
  kg: number,
  dest: string,
  discrepantEvery5th?: { farmIndex: number },
): void {
  const sendKg = kg;
  const mov = eng.send(sess(fromId, fromCap), {
    lotId,
    toActorId: toId,
    senderDeclaredKg: sendKg,
    destinationLocationId: dest,
    requireShinto: false,
  });
  let recv = sendKg;
  if (discrepantEvery5th && discrepantEvery5th.farmIndex % 5 === 4) {
    recv = sendKg - 2;
  }
  eng.receive(sess(toId, toCap), {
    movementId: mov.movementId,
    receiverDeclaredKg: recv,
  });
}

function processWashed(eng: LedgerEngine, actorId: string, lotId: string, C: number) {
  const parchment = Math.round(C * 0.55);
  const reject1 = Math.round(C * 0.05);
  const loss1 = C - parchment - reject1;
  const pLot = eng.process(sess(actorId, "Aggregator"), {
    inputLotIds: [lotId],
    outputState: "dry_parchment",
    rejectKg: reject1,
    lossKg: loss1,
    lossCategory: "moisture",
    facilityActorId: actorId,
    moisturePct: 11,
    byProducts: reject1 > 0 ? [{ kind: "defective_beans", massKg: 0 }] : [],
  });
  // reject is not a by-product lot in CORE; mass balance uses rejectKg
  const green = Math.round((parchment * 500) / 550);
  const reject2 = parchment - green;
  return eng.process(sess(actorId, "Aggregator"), {
    inputLotIds: [pLot.lotId],
    outputState: "green_washed",
    rejectKg: reject2,
    lossKg: 0,
    facilityActorId: actorId,
    moisturePct: 11.5,
  });
}

function processNatural(eng: LedgerEngine, actorId: string, lotId: string, C: number) {
  const dried = Math.round(C * 0.4);
  const reject1 = Math.round(C * 0.03);
  const loss1 = C - dried - reject1;
  const dLot = eng.process(sess(actorId, "Aggregator"), {
    inputLotIds: [lotId],
    outputState: "dried_cherry",
    rejectKg: reject1,
    lossKg: loss1,
    lossCategory: "sun-drying moisture loss",
    facilityActorId: actorId,
    moisturePct: 11,
  });
  const green = Math.round(dried * 0.85);
  const reject2 = dried - green;
  return eng.process(sess(actorId, "Aggregator"), {
    inputLotIds: [dLot.lotId],
    outputState: "green_natural",
    rejectKg: reject2,
    lossKg: 0,
    facilityActorId: actorId,
    moisturePct: 11,
  });
}

export type SeedResult = {
  engine: LedgerEngine;
  exporterId: string;
  preferredTraceLotId?: string;
  siteSummaries: Array<{ name: string; aggregatorId: string; collectorId: string; farmer0Id: string }>;
};

export function seedWorld(existing?: LedgerEngine): SeedResult {
  const eng = existing ?? createEngine();
  eng.reset();

  const exporterId = randomUUID();
  eng.seedActor({
    actorId: exporterId,
    actorType: "exporter",
    displayName: "Ankuaru Demo Exporter",
    legalIdentityRef: "REG-EXP-2201",
    status: "active",
    sponsorActorId: null,
    metadata: {
      demoSelectable: "true",
      companyName: "Ankuaru Coffee PLC",
      address: "Bole, Addis Ababa",
      exportLicense: "EXP-LIC-2201",
      nbeRegistration: "NBE-EXP-2201",
      contactPerson: "Dawit Tefera",
      contactPhone: "+251911000001",
      warehouse: "Addis Ababa Warehouse",
      yearsOperating: "12",
      region: "Addis Ababa",
      zone: "Bole",
      woreda: "Bole",
    },
    capacities: ["Exporter"],
  });
  const expUser = eng.createUser({ displayName: "Exporter Operator", email: "exporter@demo.local" });
  eng.bindUserToActor(expUser.userId, exporterId);

  const siteSummaries: SeedResult["siteSummaries"] = [];
  const washedGreens: string[] = [];
  const naturalGreens: string[] = [];

  SITES.forEach((site, si) => {
    const aggregatorId = randomUUID();
    const facilityId = randomUUID();
    const collectorId = randomUUID();
    eng.seedActor({
      actorId: aggregatorId,
      actorType: "akrabi",
      displayName: `${site.name} Aggregator`,
      legalIdentityRef: `REG-AK-${1000 + si}`,
      status: "active",
      sponsorActorId: exporterId,
      metadata: {
        demoSelectable: si < 3 ? "true" : "false",
        region: site.region,
        zone: site.zone,
        woreda: site.woreda,
        registrationNo: `AK-${1000 + si}`,
        license: `LIC-${3000 + si}`,
        warehouseLocation: `${site.name} town, ${site.woreda}`,
        yearsOperating: String(3 + (si % 5)),
        phone: `+251911${String(100000 + si).slice(-6)}`,
      },
      capacities: ["Aggregator", "FacilityOperator"],
    });
    eng.setFacility(aggregatorId, [
      site.facility === "mill" ? "dry_milling" : "wet_milling",
      site.route === "natural" ? "natural_processing" : "washed_processing",
    ]);
    eng.seedActor({
      actorId: facilityId,
      actorType: site.facility,
      displayName: `${site.name} ${site.facility === "mill" ? "Mill" : "Washing Station"}`,
      legalIdentityRef: `REG-FAC-${1000 + si}`,
      status: "active",
      sponsorActorId: aggregatorId,
      metadata: {
        region: site.region,
        zone: site.zone,
        woreda: site.woreda,
        kebele: `${site.name} 01`,
        registrationNo: `FAC-${1000 + si}`,
        capacityKgPerDay: site.facility === "mill" ? "8000" : "12000",
        operator: `${site.name} Ops`,
      },
      capacities: ["FacilityOperator"],
    });
    eng.setFacility(facilityId, [
      site.facility === "mill" ? "dry_milling" : "wet_milling",
      site.route === "natural" ? "natural_processing" : "washed_processing",
    ]);
    eng.seedActor({
      actorId: collectorId,
      actorType: "collector",
      displayName: `${site.name} Collector`,
      legalIdentityRef: `REG-COL-${1000 + si}`,
      status: "active",
      sponsorActorId: aggregatorId,
      metadata: {
        demoSelectable: si < 3 ? "true" : "false",
        region: site.region,
        zone: site.zone,
        woreda: site.woreda,
        kebele: `${site.name} market`,
        phone: `+251912${String(200000 + si).slice(-6)}`,
        coverageArea: `${site.woreda} catchment`,
        yearsCollecting: String(2 + (si % 4)),
        userOnboarded: si === 0 ? "true" : "false",
      },
      capacities: ["Collector"],
    });
    if (si === 0) {
      // Match demo profile: named collector under first aggregator
      const c = eng.getActors().find((a) => a.actorId === collectorId);
      if (c) c.displayName = "Dawit Tamiru";
    }

    const farmerIds: string[] = [];
    for (let f = 0; f < 6; f++) {
      const farmerId = randomUUID();
      eng.seedActor({
        actorId: farmerId,
        actorType: "farmer",
        displayName: `${site.name} Farmer ${f + 1}`,
        legalIdentityRef: `FAYDA-${si + 1}${f}`,
        status: "active",
        sponsorActorId: collectorId,
        metadata: {
          demoSelectable: si < 3 && f === 0 ? "true" : "false",
          region: site.region,
          zone: site.zone,
          woreda: site.woreda,
          kebele: `${site.name} kebele ${f + 1}`,
          phone: `+251913${String(300000 + si * 10 + f).slice(-6)}`,
          farmSizeHa: String(0.5 + f * 0.25),
          variety: site.route === "natural" ? "Heirloom natural" : "Heirloom washed",
          yearsFarming: String(4 + f),
          lat: String(6 + si * 0.1),
          lng: String(38 + f * 0.01),
        },
        capacities: ["Farmer"],
      });
      const u = eng.createUser({ displayName: `User ${site.name} F${f}` });
      eng.bindUserToActor(u.userId, farmerId);
      farmerIds.push(farmerId);

      const farm = eng.createFarm(sess(farmerId, "Farmer"), {
        ownerActorId: farmerId,
        displayName: `${site.name} Farm ${f + 1}`,
        pointLat: 6 + si * 0.1,
        pointLng: 38 + f * 0.01,
      });
      eng.createFarmUnit(sess(farmerId, "Farmer"), {
        farmId: farm.farmId,
        displayName: "Main plot",
      });
    }

    siteSummaries.push({
      name: site.name,
      aggregatorId,
      collectorId,
      farmer0Id: farmerIds[0]!,
    });

    const baseMass = 500;

    // Cycle 1: Historical FOB
    const cycle1Lots: string[] = [];
    farmerIds.forEach((fid, fi) => {
      const lot = eng.createOriginLot(sess(fid, "Farmer"), {
        massKg: baseMass,
        processingState: "cherry",
        processingRoute: site.route === "natural" ? "natural" : "washed",
        cropYear: "2025-2026",
      });
      hop(eng, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`, {
        farmIndex: fi,
      });
      hop(eng, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", baseMass, `${site.name} station`);
      cycle1Lots.push(lot.lotId);
    });
    const combined1 = eng.aggregate(sess(aggregatorId, "Aggregator"), {
      parentLotIds: cycle1Lots,
    });
    const green1 =
      site.route === "natural"
        ? processNatural(eng, aggregatorId, combined1.lotId, combined1.canonicalMassKg)
        : processWashed(eng, aggregatorId, combined1.lotId, combined1.canonicalMassKg);
    eng.transferOwnership(sess(aggregatorId, "Aggregator"), {
      lotId: green1.lotId,
      newOwnerActorId: exporterId,
    });
    hop(
      eng,
      green1.lotId,
      aggregatorId,
      "Aggregator",
      exporterId,
      "Exporter",
      green1.canonicalMassKg,
      "Addis Ababa Warehouse",
    );
    eng.terminalDispose(sess(exporterId, "Exporter"), {
      lotId: green1.lotId,
      reason: "fob_export",
    });

    // Cycle 2: Open collector inventory (4 farms)
    const cycle2: string[] = [];
    for (let f = 0; f < 4; f++) {
      const fid = farmerIds[f]!;
      const lot = eng.createOriginLot(sess(fid, "Farmer"), {
        massKg: baseMass,
        processingRoute: site.route === "natural" ? "natural" : "washed",
        cropYear: "2025-2026",
      });
      hop(eng, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`);
      cycle2.push(lot.lotId);
    }
    eng.aggregate(sess(collectorId, "Collector"), { parentLotIds: cycle2 });

    // Cycle 3: Active exporter greens
    const cycle3: string[] = [];
    farmerIds.forEach((fid) => {
      const lot = eng.createOriginLot(sess(fid, "Farmer"), {
        massKg: baseMass,
        processingRoute: site.route === "natural" ? "natural" : "washed",
        cropYear: "2025-2026",
      });
      hop(eng, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`);
      hop(eng, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", baseMass, `${site.name} station`);
      cycle3.push(lot.lotId);
    });
    const combined3 = eng.aggregate(sess(aggregatorId, "Aggregator"), {
      parentLotIds: cycle3,
    });
    const green3 =
      site.route === "natural"
        ? processNatural(eng, aggregatorId, combined3.lotId, combined3.canonicalMassKg)
        : processWashed(eng, aggregatorId, combined3.lotId, combined3.canonicalMassKg);
    eng.transferOwnership(sess(aggregatorId, "Aggregator"), {
      lotId: green3.lotId,
      newOwnerActorId: exporterId,
    });
    hop(
      eng,
      green3.lotId,
      aggregatorId,
      "Aggregator",
      exporterId,
      "Exporter",
      green3.canonicalMassKg,
      "Addis Ababa Warehouse",
    );
    if (site.route === "natural") naturalGreens.push(green3.lotId);
    else washedGreens.push(green3.lotId);

    // Demo farmer lot for first 3 sites
    if (si < 3) {
      eng.createOriginLot(sess(farmerIds[0]!, "Farmer"), {
        massKg: 310 + 40 * si,
        cropYear: "2025-2026",
      });
    }
  });

  let preferredTraceLotId: string | undefined;
  if (washedGreens.length >= 2) {
    const blend = eng.aggregate(sess(exporterId, "Exporter"), {
      parentLotIds: washedGreens,
    });
    preferredTraceLotId = blend.lotId;
  }
  if (naturalGreens.length >= 2) {
    eng.aggregate(sess(exporterId, "Exporter"), { parentLotIds: naturalGreens });
  }

  return { engine: eng, exporterId, preferredTraceLotId, siteSummaries };
}

export function serializeSeed(result: SeedResult) {
  const eng = result.engine;
  return {
    exporterId: result.exporterId,
    preferredTraceLotId: result.preferredTraceLotId,
    siteSummaries: result.siteSummaries,
    actors: eng.getActors(),
    lots: eng.getLots(),
    events: eng.getEvents(),
    lineage: eng.getLineage(),
    movements: eng.getMovements(),
    integrity: eng.integrityChecks(),
  };
}
