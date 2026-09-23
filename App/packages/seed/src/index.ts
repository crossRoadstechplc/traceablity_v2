import { randomUUID } from "node:crypto";
import {
  createEngine,
  type LedgerEngine,
  type Session,
} from "@ankuaru/engine";
import { DEFAULT_FACILITY_CAPABILITIES } from "@ankuaru/schema";

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

const DAY_MS = 24 * 3600 * 1000;

/** One identified User per Actor (Module 01): every seeded action traces to a bound person. */
class SeedUsers {
  private byActor = new Map<string, string>();
  constructor(private eng: LedgerEngine) {}

  bind(actorId: string, displayName: string, email?: string): string {
    const u = this.eng.createUser({ displayName, email });
    this.eng.bindUserToActor(u.userId, actorId);
    this.byActor.set(actorId, u.userId);
    return u.userId;
  }

  sess(actorId: string, capacity: Session["capacity"]): Session {
    const userId = this.byActor.get(actorId);
    if (!userId) throw new Error(`seed: no user bound to ${actorId}`);
    return { userId, actorId, capacity, sourceChannel: "api" };
  }
}

type HopOpts = {
  receiveKg?: number;
  shinto?: { grade: string };
  contractId?: string;
  transactionChannel?: "direct_linkage" | "primary_transaction_center" | "ecx";
  transporterId?: string;
};

function shintoFor(kg: number, grade: string) {
  return { weightKg: kg, volumeBags: Math.ceil(kg / 60), grade, sealStatusOrigin: "sealed at origin" };
}

function hop(
  eng: LedgerEngine,
  users: SeedUsers,
  lotId: string,
  fromId: string,
  fromCap: Session["capacity"],
  toId: string,
  toCap: Session["capacity"],
  kg: number,
  dest: string,
  opts: HopOpts = {},
) {
  const mov = eng.send(users.sess(fromId, fromCap), {
    lotId,
    toActorId: toId,
    senderDeclaredKg: kg,
    destinationLocationId: dest,
    transporterActorId: opts.transporterId,
    shinto: opts.shinto ? shintoFor(kg, opts.shinto.grade) : undefined,
  });
  return eng.receive(users.sess(toId, toCap), {
    movementId: mov.movementId,
    receiverDeclaredKg: opts.receiveKg ?? kg,
    stationSealIntact: opts.shinto ? true : undefined,
    stationNetWeightKg: opts.shinto ? (opts.receiveKg ?? kg) : undefined,
    contractId: opts.contractId,
    transactionChannel: opts.transactionChannel,
  });
}

function processWashed(
  eng: LedgerEngine,
  users: SeedUsers,
  actorId: string,
  facilityId: string,
  lotId: string,
  C: number,
) {
  const parchment = Math.round(C * 0.55);
  const reject1 = Math.round(C * 0.05);
  const loss1 = C - parchment - reject1;
  const pLot = eng.process(users.sess(actorId, "Aggregator"), {
    inputLotIds: [lotId],
    outputState: "dry_parchment",
    rejectKg: reject1,
    lossKg: loss1,
    lossCategory: "moisture",
    facilityActorId: facilityId,
    moisturePct: 11,
  });
  const green = Math.round((parchment * 500) / 550);
  const reject2 = parchment - green;
  return eng.process(users.sess(actorId, "Aggregator"), {
    inputLotIds: [pLot.lotId],
    outputState: "green_washed",
    rejectKg: reject2,
    lossKg: 0,
    facilityActorId: facilityId,
    moisturePct: 11.5,
  });
}

function processNatural(
  eng: LedgerEngine,
  users: SeedUsers,
  actorId: string,
  facilityId: string,
  lotId: string,
  C: number,
) {
  const dried = Math.round(C * 0.4);
  const reject1 = Math.round(C * 0.03);
  const loss1 = C - dried - reject1;
  const dLot = eng.process(users.sess(actorId, "Aggregator"), {
    inputLotIds: [lotId],
    outputState: "dried_cherry",
    rejectKg: reject1,
    lossKg: loss1,
    lossCategory: "sun-drying moisture loss",
    facilityActorId: facilityId,
    moisturePct: 11,
  });
  const green = Math.round(dried * 0.85);
  const reject2 = dried - green;
  return eng.process(users.sess(actorId, "Aggregator"), {
    inputLotIds: [dLot.lotId],
    outputState: "green_natural",
    rejectKg: reject2,
    lossKg: 0,
    facilityActorId: facilityId,
    moisturePct: 11,
  });
}

function squarePolygon(lat: number, lng: number, sizeDeg: number) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + sizeDeg, lat],
        [lng + sizeDeg, lat + sizeDeg],
        [lng, lat + sizeDeg],
        [lng, lat],
      ],
    ],
  };
}

export type SeedResult = {
  engine: LedgerEngine;
  /** First exporter (owns the preferred trace blend). */
  exporterId: string;
  exporterIds: string[];
  preferredTraceLotId?: string;
  platformAdminId: string;
  regulatorId: string;
  verifierId: string;
  transporterId: string;
  importerId: string;
  siteSummaries: Array<{
    name: string;
    aggregatorId: string;
    collectorId: string;
    facilityId: string;
    farmer0Id: string;
  }>;
};

export function seedWorld(existing?: LedgerEngine): SeedResult {
  const eng = existing ?? createEngine();
  eng.reset();
  const users = new SeedUsers(eng);

  // Platform actor first (bootstrap envelope), then every other actor is onboarded under its session.
  const platformAdminId = randomUUID();
  eng.seedActor({
    actorId: platformAdminId,
    actorType: "platform_admin",
    displayName: "Ankuaru Platform Operations",
    legalIdentityRef: "ANK-PLATFORM-01",
    status: "active",
    sponsorActorId: null,
    metadata: { demoSelectable: "true", serviceRole: "true", organisation: "Ankuaru" },
    capacities: ["PlatformAdmin"],
  });
  users.bind(platformAdminId, "Selam Bekele (platform operator)", "selam.bekele@ankuaru.demo");
  const platform = users.sess(platformAdminId, "PlatformAdmin");

  const serviceActor = (
    actorType: "regulator" | "verifier" | "transporter" | "importer",
    displayName: string,
    legalIdentityRef: string,
    capacity: Session["capacity"],
    person: string,
    email: string,
    metadata: Record<string, string>,
  ) => {
    const id = randomUUID();
    eng.seedActor(
      {
        actorId: id,
        actorType,
        displayName,
        legalIdentityRef,
        status: "active",
        sponsorActorId: null,
        metadata: { demoSelectable: "true", serviceRole: "true", ...metadata },
        capacities: [capacity],
      },
      platform,
    );
    users.bind(id, person, email);
    return id;
  };

  const regulatorId = serviceActor(
    "regulator",
    "ECTA Regulatory Office",
    "ECTA-REG-001",
    "Regulator",
    "Hirut Alemu (ECTA inspector)",
    "hirut.alemu@ecta.demo",
    { region: "Addis Ababa", jurisdiction: "Federal" },
  );
  const verifierId = serviceActor(
    "verifier",
    "Horn Assurance Verification",
    "VER-HAV-014",
    "Verifier",
    "Mekdes Girma (lead verifier)",
    "mekdes.girma@hornassurance.demo",
    { accreditation: "ISO 17065", region: "Addis Ababa" },
  );
  const transporterId = serviceActor(
    "transporter",
    "Rift Valley Haulage",
    "TR-RVH-221",
    "Transporter",
    "Abebe Tadesse (dispatch)",
    "abebe.tadesse@riftvalley.demo",
    { fleetSize: "14", region: "Sidama" },
  );
  // Importer is the chain root (CORE §2.1): it sponsors every exporter.
  const importerId = randomUUID();
  eng.seedActor(
    {
      actorId: importerId,
      actorType: "importer",
      displayName: "Nordic Green Coffee AB",
      legalIdentityRef: "EU-IMP-SE-5561",
      status: "active",
      sponsorActorId: null,
      metadata: {
        demoSelectable: "true",
        country: "Sweden",
        market: "EU",
        companyName: "Nordic Green Coffee AB",
        address: "Frihamnen, Stockholm",
        contactPerson: "Lina Karlsson",
        contactPhone: "+46 8 555 0101",
        warehouse: "Gothenburg bonded warehouse",
        yearsOperating: "18",
      },
      capacities: ["Importer"],
    },
    platform,
  );
  users.bind(importerId, "Lina Karlsson (sourcing)", "lina.karlsson@nordicgreen.demo");

  const regulator = users.sess(regulatorId, "Regulator");
  const cocWindow = (days: number) => ({
    validFrom: new Date(Date.now() - 30 * DAY_MS).toISOString(),
    validTo: new Date(Date.now() + days * DAY_MS).toISOString(),
  });
  const fullCoc = { infrastructure: true, personnel: true, labAccess: true, taxLegal: true };

  const EXPORTERS = [
    {
      displayName: "Ankuaru Demo Exporter",
      ref: "2201",
      companyName: "Ankuaru Coffee PLC",
      address: "Bole, Addis Ababa",
      contactPerson: "Dawit Tefera",
      email: "dawit.tefera@ankuaru.demo",
      woreda: "Bole",
      yearsOperating: "12",
      primaryDestinations: "Sweden, Germany, Japan",
      annualVolumeBags: "18000",
      certifications: "Organic (EU), Rainforest Alliance",
      bank: "Commercial Bank of Ethiopia",
    },
    {
      displayName: "Sidama Highlands Export",
      ref: "2202",
      companyName: "Sidama Highlands Export PLC",
      address: "Kirkos, Addis Ababa",
      contactPerson: "Meron Hailu",
      email: "meron.hailu@sidamahighlands.demo",
      woreda: "Kirkos",
      yearsOperating: "9",
      primaryDestinations: "Sweden, Norway",
      annualVolumeBags: "11000",
      certifications: "Fairtrade",
      bank: "Awash Bank",
    },
    {
      displayName: "Guji Origin Traders",
      ref: "2203",
      companyName: "Guji Origin Traders PLC",
      address: "Yeka, Addis Ababa",
      contactPerson: "Tesfaye Bekele",
      email: "tesfaye.bekele@gujiorigin.demo",
      woreda: "Yeka",
      yearsOperating: "6",
      primaryDestinations: "Denmark, Finland",
      annualVolumeBags: "7000",
      certifications: "Organic (EU)",
      bank: "Dashen Bank",
    },
  ];
  const exporterIds = EXPORTERS.map((x, i) => {
    const id = randomUUID();
    eng.seedActor(
      {
        actorId: id,
        actorType: "exporter",
        displayName: x.displayName,
        legalIdentityRef: `REG-EXP-${x.ref}`,
        status: "active",
        sponsorActorId: importerId,
        metadata: {
          demoSelectable: "true",
          companyName: x.companyName,
          address: x.address,
          exportLicense: `EXP-LIC-${x.ref}`,
          nbeRegistration: `NBE-EXP-${x.ref}`,
          contactPerson: x.contactPerson,
          contactPhone: `+25191100000${i + 1}`,
          warehouse: "Addis Ababa Warehouse",
          yearsOperating: x.yearsOperating,
          region: "Addis Ababa",
          zone: "Addis Ababa",
          woreda: x.woreda,
          primaryDestinations: x.primaryDestinations,
          annualVolumeBags: x.annualVolumeBags,
          certifications: x.certifications,
          bank: x.bank,
          tin: `00123456${70 + i}`,
        },
        capacities: ["Exporter"],
      },
      platform,
    );
    users.bind(id, x.contactPerson, x.email);
    eng.issueCredential(regulator, { actorId: id, kind: "federal_coc", criteria: fullCoc, ...cocWindow(365) });
    return id;
  });
  const exporterId = exporterIds[0]!;
  /** Sites 0–2 → exporter 0, 3–5 → exporter 1, 6–7 → exporter 2. */
  const exporterForSite = (si: number) => exporterIds[si < 3 ? 0 : si < 6 ? 1 : 2]!;

  const siteSummaries: SeedResult["siteSummaries"] = [];
  const washedGreens = new Map<string, string[]>();
  const naturalGreens = new Map<string, string[]>();
  /** Mapped plots (> 4 ha, washed sites) — the verifier runs deforestation overlays on these. */
  const mappedUnits: Array<{ farmUnitId: string; farmerId: string; site: string }> = [];
  const pushGreen = (m: Map<string, string[]>, exp: string, lotId: string) => {
    const list = m.get(exp) ?? [];
    list.push(lotId);
    m.set(exp, list);
  };

  SITES.forEach((site, si) => {
    const exporterId = exporterForSite(si);
    const aggregatorId = randomUUID();
    const facilityId = randomUUID();
    eng.seedActor(
      {
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
        capacities: ["Aggregator"],
      },
      platform,
    );
    users.bind(aggregatorId, `${site.name} aggregator manager`);
    eng.issueCredential(regulator, {
      actorId: aggregatorId,
      kind: "federal_coc",
      criteria: fullCoc,
      // one credential inside the 7-day expiry window so the notice path is exercised
      ...cocWindow(si === 2 ? 5 : 365),
    });

    eng.seedActor(
      {
        actorId: facilityId,
        actorType: site.facility,
        displayName: `${site.name} ${site.facility === "mill" ? "Mill" : "Washing Station"}`,
        legalIdentityRef: `REG-FAC-${1000 + si}`,
        status: "active",
        sponsorActorId: aggregatorId,
        metadata: {
          demoSelectable: si < 3 ? "true" : "false",
          region: site.region,
          zone: site.zone,
          woreda: site.woreda,
          kebele: `${site.name} 01`,
          registrationNo: `FAC-${1000 + si}`,
          capacityKgPerDay: site.facility === "mill" ? "8000" : "12000",
          operator: `${site.name} Ops`,
        },
        capacities: ["FacilityOperator"],
      },
      platform,
    );
    users.bind(facilityId, `${site.name} station operator`);
    eng.setFacility(facilityId, [...DEFAULT_FACILITY_CAPABILITIES[site.facility]]);

    const collectorMeta = {
      region: site.region,
      zone: site.zone,
      woreda: site.woreda,
      kebele: `${site.name} market`,
      phone: `+251912${String(200000 + si).slice(-6)}`,
      coverageArea: `${site.woreda} catchment`,
      yearsCollecting: String(2 + (si % 4)),
    };
    let collectorId: string;
    if (si === 0) {
      // A real in-app onboarding by the aggregator — the only named collector in the seed
      const c = eng.onboardActor(users.sess(aggregatorId, "Aggregator"), {
        actorType: "collector",
        displayName: "Dawit Tamiru",
        legalIdentityRef: `REG-COL-${1000 + si}`,
        sponsorActorId: aggregatorId,
        metadata: { ...collectorMeta, demoSelectable: "true" },
      });
      collectorId = c.actorId;
    } else {
      collectorId = randomUUID();
      eng.seedActor(
        {
          actorId: collectorId,
          actorType: "collector",
          displayName: `${site.name} Collector`,
          legalIdentityRef: `REG-COL-${1000 + si}`,
          status: "active",
          sponsorActorId: aggregatorId,
          metadata: { ...collectorMeta, demoSelectable: si < 3 ? "true" : "false" },
          capacities: ["Collector"],
        },
        platform,
      );
    }
    users.bind(collectorId, `${site.name} collector`);

    const farmerIds: string[] = [];
    for (let f = 0; f < 6; f++) {
      const farmerId = randomUUID();
      const lat = 6 + si * 0.1;
      const lng = 38 + f * 0.01;
      eng.seedActor(
        {
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
            // farmer 6 on each site holds a > 4 ha plot, which EUDR requires as a polygon
            farmSizeHa: f === 5 ? "5.2" : String(0.5 + f * 0.25),
            variety: site.route === "natural" ? "Heirloom natural" : "Heirloom washed",
            yearsFarming: String(4 + f),
            lat: String(lat),
            lng: String(lng),
          },
          capacities: ["Farmer"],
        },
        platform,
      );
      users.bind(farmerId, `${site.name} farmer ${f + 1}`);
      farmerIds.push(farmerId);

      const farmer = users.sess(farmerId, "Farmer");
      const farm = eng.createFarm(farmer, {
        ownerActorId: farmerId,
        displayName: `${site.name} Farm ${f + 1}`,
        pointLat: lat,
        pointLng: lng,
      });
      const unit = eng.createFarmUnit(farmer, {
        farmId: farm.farmId,
        displayName: "Main plot",
      });
      // Washed sites have mapped their large plots; natural sites have not (EUDR composition stays mixed)
      if (f === 5 && site.route === "washed") {
        eng.addGeometryVersion(farmer, {
          farmUnitId: unit.farmUnitId,
          geojson: squarePolygon(lat, lng, 0.02),
        });
        mappedUnits.push({ farmUnitId: unit.farmUnitId, farmerId, site: site.name });
      }
    }

    siteSummaries.push({
      name: site.name,
      aggregatorId,
      collectorId,
      facilityId,
      farmer0Id: farmerIds[0]!,
    });

    const exporter = users.sess(exporterId, "Exporter");
    const contract = eng.registerContract(exporter, {
      supplierActorId: aggregatorId,
      exporterActorId: exporterId,
      coffeeType: site.route === "natural" ? "Natural (sundried)" : "Washed",
      quantityKg: 10000,
      grade: site.route === "natural" ? "Grade 3" : "Grade 2",
      priceEtbPerKg: 185 + si,
      executionPeriod: "2025-2026 harvest",
      paymentTerms: "Within 3 days of grading",
      deliverySite: "Addis Ababa Warehouse",
      transportCostAlloc: "Supplier to Addis",
      registrationRef: `ECTA-DL-${2400 + si}`,
    });
    const greenGrade = site.route === "natural" ? "Grade 3" : "Grade 2";
    const route = site.route === "natural" ? "natural" : "washed";
    const toExporter = (lotId: string, kg: number) => {
      eng.transferOwnership(users.sess(aggregatorId, "Aggregator"), {
        lotId,
        newOwnerActorId: exporterId,
        transactionChannel: "direct_linkage",
        contractId: contract.contractId,
      });
      return hop(eng, users, lotId, aggregatorId, "Aggregator", exporterId, "Exporter", kg, "Addis Ababa Warehouse", {
        shinto: { grade: greenGrade },
        contractId: contract.contractId,
        transactionChannel: "direct_linkage",
        transporterId,
      });
    };
    const processAtSite = (lotId: string, kg: number) =>
      site.route === "natural"
        ? processNatural(eng, users, aggregatorId, facilityId, lotId, kg)
        : processWashed(eng, users, aggregatorId, facilityId, lotId, kg);

    const baseMass = 500;

    // Cycle 1: Historical FOB (−2 kg discrepancy on the collector→aggregator hop of every 5th farm)
    const cycle1Lots: string[] = [];
    farmerIds.forEach((fid, fi) => {
      const lot = eng.createOriginLot(users.sess(fid, "Farmer"), {
        massKg: baseMass,
        processingState: "cherry",
        processingRoute: route,
        cropYear: "2025-2026",
      });
      hop(eng, users, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`);
      hop(eng, users, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", baseMass, `${site.name} station`, {
        receiveKg: fi % 5 === 4 ? baseMass - 2 : baseMass,
      });
      cycle1Lots.push(lot.lotId);
    });
    const combined1 = eng.aggregate(users.sess(aggregatorId, "Aggregator"), {
      parentLotIds: cycle1Lots,
    });
    const green1 = processAtSite(combined1.lotId, combined1.canonicalMassKg);
    const mov1 = toExporter(green1.lotId, green1.canonicalMassKg);
    for (const ob of eng.getObligations()) {
      if (ob.status === "open" && ob.payload.movementId === mov1.movementId) {
        eng.closeObligation(exporter, { obligationId: ob.obligationId, note: "Settled by bank transfer" });
      }
    }
    eng.terminalDispose(exporter, {
      lotId: green1.lotId,
      reason: "fob_export",
      buyerActorId: importerId,
    });

    // Cycle 2: Open collector inventory (4 farms)
    const cycle2: string[] = [];
    for (let f = 0; f < 4; f++) {
      const fid = farmerIds[f]!;
      const lot = eng.createOriginLot(users.sess(fid, "Farmer"), {
        massKg: baseMass,
        processingRoute: route,
        cropYear: "2025-2026",
      });
      hop(eng, users, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`);
      cycle2.push(lot.lotId);
    }
    eng.aggregate(users.sess(collectorId, "Collector"), { parentLotIds: cycle2 });

    // Cycle 3: Active exporter greens
    const cycle3: string[] = [];
    farmerIds.forEach((fid) => {
      const lot = eng.createOriginLot(users.sess(fid, "Farmer"), {
        massKg: baseMass,
        processingRoute: route,
        cropYear: "2025-2026",
      });
      hop(eng, users, lot.lotId, fid, "Farmer", collectorId, "Collector", baseMass, `${site.name} collection`);
      hop(eng, users, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", baseMass, `${site.name} station`);
      cycle3.push(lot.lotId);
    });
    const combined3 = eng.aggregate(users.sess(aggregatorId, "Aggregator"), {
      parentLotIds: cycle3,
    });
    const green3 = processAtSite(combined3.lotId, combined3.canonicalMassKg);
    toExporter(green3.lotId, green3.canonicalMassKg);
    if (si === SITES.length - 1) {
      // Importer workspace stock: last site's active green is shipped on to the importer
      hop(eng, users, green3.lotId, exporterId, "Exporter", importerId, "Importer", green3.canonicalMassKg, "Gothenburg bonded warehouse", {
        shinto: { grade: greenGrade },
        transporterId,
      });
    } else if (site.route === "natural") pushGreen(naturalGreens, exporterId, green3.lotId);
    else pushGreen(washedGreens, exporterId, green3.lotId);

    // Cycle 4: open working inventory for every role (Workspace must not be empty)
    eng.createOriginLot(users.sess(farmerIds[0]!, "Farmer"), {
      massKg: 420,
      processingRoute: route,
      cropYear: "2025-2026",
    });
    eng.createOriginLot(users.sess(farmerIds[1]!, "Farmer"), {
      massKg: 360,
      processingRoute: route,
      cropYear: "2025-2026",
    });
    for (let f = 0; f < 3; f++) {
      const fid = farmerIds[f]!;
      const lot = eng.createOriginLot(users.sess(fid, "Farmer"), {
        massKg: 440,
        processingRoute: route,
        cropYear: "2025-2026",
      });
      hop(eng, users, lot.lotId, fid, "Farmer", collectorId, "Collector", 440, `${site.name} collection`);
    }
    {
      const openAgg: string[] = [];
      for (let f = 0; f < 2; f++) {
        const fid = farmerIds[f]!;
        const lot = eng.createOriginLot(users.sess(fid, "Farmer"), {
          massKg: 460,
          processingRoute: route,
          cropYear: "2025-2026",
        });
        hop(eng, users, lot.lotId, fid, "Farmer", collectorId, "Collector", 460, `${site.name} collection`);
        hop(eng, users, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", 460, `${site.name} station`);
        openAgg.push(lot.lotId);
      }
      eng.aggregate(users.sess(aggregatorId, "Aggregator"), { parentLotIds: openAgg });
    }
    {
      const lot = eng.createOriginLot(users.sess(farmerIds[0]!, "Farmer"), {
        massKg: 500,
        processingRoute: route,
        cropYear: "2025-2026",
      });
      hop(eng, users, lot.lotId, farmerIds[0]!, "Farmer", collectorId, "Collector", 500, `${site.name} collection`);
      hop(eng, users, lot.lotId, collectorId, "Collector", aggregatorId, "Aggregator", 500, `${site.name} station`);
      const green = processAtSite(lot.lotId, 500);
      if (si < 2) {
        // Live consignment: dispatched to Addis on a Rift Valley truck, awaiting the exporter's receipt
        eng.transferOwnership(users.sess(aggregatorId, "Aggregator"), {
          lotId: green.lotId,
          newOwnerActorId: exporterId,
          transactionChannel: "direct_linkage",
          contractId: contract.contractId,
        });
        eng.send(users.sess(aggregatorId, "Aggregator"), {
          lotId: green.lotId,
          toActorId: exporterId,
          senderDeclaredKg: green.canonicalMassKg,
          destinationLocationId: "Addis Ababa Warehouse",
          transporterActorId: transporterId,
          shinto: shintoFor(green.canonicalMassKg, greenGrade),
        });
      }
    }

    // CORE §11 step 4: extra origin cherry left with the demo farmer (sites 0–2)
    if (si < 3) {
      eng.createOriginLot(users.sess(farmerIds[0]!, "Farmer"), {
        massKg: 310 + 40 * si,
        cropYear: "2025-2026",
      });
    }
  });

  // Cross-aggregator blends are per exporter (an exporter only combines lots it holds).
  let preferredTraceLotId: string | undefined;
  /** Each exporter's headline green lot (its washed blend, or its only washed green). */
  const headlineGreen = new Map<string, string>();
  for (const expId of exporterIds) {
    const exporter = users.sess(expId, "Exporter");
    const washed = washedGreens.get(expId) ?? [];
    const natural = naturalGreens.get(expId) ?? [];
    if (washed.length === 1) headlineGreen.set(expId, washed[0]!);
    if (washed.length >= 2) {
      const blend = eng.aggregate(exporter, { parentLotIds: washed });
      headlineGreen.set(expId, blend.lotId);
      if (expId === exporterId) preferredTraceLotId = blend.lotId;
      else eng.assessLotCompliance(exporter, { lotId: blend.lotId, frameworkCode: "EUDR", market: "EU" });
    }
    if (natural.length >= 2) {
      const blend = eng.aggregate(exporter, { parentLotIds: natural });
      eng.assessLotCompliance(exporter, { lotId: blend.lotId, frameworkCode: "EUDR", market: "EU" });
    }
  }
  if (preferredTraceLotId) {
    const exporter = users.sess(exporterId, "Exporter");
    const blend = { lotId: preferredTraceLotId };
    // Module 07/08: a DDS verified by an independent verifier, then an EUDR assessment on the blend
    const dds = eng.uploadEvidence(exporter, {
      attachedType: "lot",
      attachedId: blend.lotId,
      evidenceClass: "official_authority",
      documentType: "due_diligence_statement",
      factSupported: "EUDR due diligence for washed blend",
      issuer: "Ankuaru Coffee PLC",
      validFrom: new Date(Date.now() - DAY_MS).toISOString(),
      validTo: new Date(Date.now() + 180 * DAY_MS).toISOString(),
    });
    eng.verifyEvidence(users.sess(verifierId, "Verifier"), dds.evidenceId, {
      authority: "Horn Assurance Verification",
    });
    eng.assessLotCompliance(exporter, { lotId: blend.lotId, frameworkCode: "EUDR", market: "EU" });
  }

  seedServiceActivity(eng, users, {
    platformAdminId,
    regulatorId,
    verifierId,
    exporterIds,
    importerId,
    headlineGreen,
    siteSummaries,
    mappedUnits,
  });

  return {
    engine: eng,
    exporterId,
    exporterIds,
    preferredTraceLotId,
    platformAdminId,
    regulatorId,
    verifierId,
    transporterId,
    importerId,
    siteSummaries,
  };
}

/**
 * Module 12/14 service surfaces: give every oversight / service role real work
 * on day one — verifier queue, overlays, regulator cases, stocktakes, admin registry.
 */
function seedServiceActivity(
  eng: LedgerEngine,
  users: SeedUsers,
  ctx: {
    platformAdminId: string;
    regulatorId: string;
    verifierId: string;
    exporterIds: string[];
    importerId: string;
    headlineGreen: Map<string, string>;
    siteSummaries: SeedResult["siteSummaries"];
    mappedUnits: Array<{ farmUnitId: string; farmerId: string; site: string }>;
  },
) {
  const verifier = users.sess(ctx.verifierId, "Verifier");
  const regulator = users.sess(ctx.regulatorId, "Regulator");
  const platform = users.sess(ctx.platformAdminId, "PlatformAdmin");
  const site = (name: string) => ctx.siteSummaries.find((s) => s.name === name)!;
  const iso = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

  // ── Verifier: evidence queue (pending, verified, revoked) ────────────────
  const [, exp1, exp2] = ctx.exporterIds as [string, string, string];
  const exp1Blend = ctx.headlineGreen.get(exp1);
  if (exp1Blend) {
    eng.uploadEvidence(users.sess(exp1, "Exporter"), {
      attachedType: "lot",
      attachedId: exp1Blend,
      evidenceClass: "official_authority",
      documentType: "due_diligence_statement",
      factSupported: "EUDR due diligence for Sidama Highlands washed blend",
      issuer: "Sidama Highlands Export PLC",
      validFrom: iso(-2),
      validTo: iso(180),
    });
  }
  const exp2Green = ctx.headlineGreen.get(exp2);
  if (exp2Green) {
    eng.uploadEvidence(users.sess(exp2, "Exporter"), {
      attachedType: "lot",
      attachedId: exp2Green,
      evidenceClass: "official_authority",
      documentType: "phytosanitary_certificate",
      factSupported: "Lot is free of quarantine pests for export to the EU",
      issuer: "Ethiopian Agricultural Authority",
      validFrom: iso(-1),
      validTo: iso(60),
    });
  }
  const yirga = site("Yirgacheffe");
  const organic = eng.uploadEvidence(users.sess(yirga.aggregatorId, "Aggregator"), {
    attachedType: "actor",
    attachedId: yirga.aggregatorId,
    evidenceClass: "official_authority",
    documentType: "organic_certificate",
    factSupported: "Yirgacheffe station operates under EU organic certification",
    issuer: "Control Union Certifications",
    validFrom: iso(-90),
    validTo: iso(275),
  });
  eng.verifyEvidence(verifier, organic.evidenceId, { authority: "Horn Assurance Verification" });
  const hambela = site("Hambela");
  const ra = eng.uploadEvidence(users.sess(hambela.aggregatorId, "Aggregator"), {
    attachedType: "actor",
    attachedId: hambela.aggregatorId,
    evidenceClass: "official_authority",
    documentType: "rainforest_alliance_certificate",
    factSupported: "Hambela station is Rainforest Alliance certified",
    issuer: "Rainforest Alliance",
    validFrom: iso(-200),
    validTo: iso(165),
  });
  eng.verifyEvidence(verifier, ra.evidenceId, { authority: "Horn Assurance Verification" });
  eng.revokeEvidence(verifier, ra.evidenceId, iso(-3), "Certificate withdrawn by the scheme owner after audit");
  eng.uploadEvidence(users.sess(yirga.farmer0Id, "Farmer"), {
    attachedType: "actor",
    attachedId: yirga.farmer0Id,
    evidenceClass: "self_assessment",
    documentType: "no_deforestation_declaration",
    factSupported: "No forest cleared on my plots since 31 Dec 2020",
  });

  // ── Verifier: deforestation overlays on mapped plots ─────────────────────
  for (const u of ctx.mappedUnits) {
    const flagged = u.site === "Dilla";
    eng.recordOverlay(verifier, {
      farmUnitId: u.farmUnitId,
      dataset: "JRC Global Forest Cover 2020 + Hansen GFC 2023",
      result: flagged
        ? "Possible tree-cover loss of 0.4 ha in 2022 — field check required"
        : "No tree-cover loss after 31 Dec 2020",
    });
    if (flagged) {
      eng.raiseIssue(verifier, {
        intervention: "FLAG",
        authorityTag: "OFFICIAL_TECHNICAL_STANDARD",
        subjectType: "farm_unit",
        subjectId: u.farmUnitId,
        summary: `Satellite overlay shows possible tree-cover loss on a ${u.site} plot — field visit scheduled`,
        partyActorIds: [u.farmerId],
        ruleRef: "EUDR-GEO",
      });
    }
  }

  // ── Facility operators: an equipment flag at a mill ──────────────────────
  const bensa = site("Bensa");
  eng.raiseIssue(users.sess(bensa.facilityId, "FacilityOperator"), {
    intervention: "FLAG",
    subjectType: "actor",
    subjectId: bensa.facilityId,
    summary: "Moisture meter calibration is due — readings may drift by ±0.5% until recalibrated",
    partyActorIds: [bensa.aggregatorId],
  });

  // ── Stocktakes: one within tolerance, one variance explained ─────────────
  const stocktakeAt = (aggregatorId: string, shortKg: number, reason?: string) => {
    const lot = eng.inventory(aggregatorId)[0];
    if (!lot) return;
    const theoretical = eng.stockBalance(aggregatorId, lot.processingState);
    const st = eng.stocktake(users.sess(aggregatorId, "Aggregator"), {
      coffeeState: lot.processingState,
      physicalKg: Math.max(0, theoretical - shortKg),
    });
    if (reason) eng.recordStockAdjustment(users.sess(aggregatorId, "Aggregator"), { stocktakeId: st.id, reason });
  };
  stocktakeAt(yirga.aggregatorId, 12);
  stocktakeAt(bensa.aggregatorId, 180, "Sun-drying shrinkage on the patio not yet recorded as processing loss");

  // ── Regulator: credentials, an investigation, a sanction, access log ─────
  const dilla = site("Dilla");
  eng.issueCredential(regulator, {
    actorId: dilla.aggregatorId,
    kind: "regional_coc",
    criteria: { infrastructure: true, personnel: true, labAccess: false, taxLegal: true },
    validFrom: iso(-10),
    validTo: iso(355),
  });
  const shakiso = site("Shakiso");
  eng.raiseIssue(regulator, {
    intervention: "WARN",
    authorityTag: "LEGAL_REQUIREMENT",
    subjectType: "actor",
    subjectId: shakiso.aggregatorId,
    summary: "Unlicensed collection point reported at Shakiso market buying on behalf of the station",
    partyActorIds: [shakiso.aggregatorId, shakiso.collectorId],
    ruleRef: "REG-D02-06",
  });
  eng.recordSanction(regulator, {
    actorId: shakiso.aggregatorId,
    step: "written_warning",
    reason: "Purchases recorded through an unlicensed collection point (ECTA inspection 14 Sep)",
  });
  for (const [dataAccessed, purpose] of [
    ["lineage of export blends (Ankuaru Demo Exporter)", "Quarterly EUDR export audit"],
    ["Shakiso aggregator activity and receipts", "Investigation into unlicensed collection"],
    ["credential register", "Annual Certificate of Competency renewal review"],
  ] as const) {
    eng.logRegulatorAccess(regulator, { dataAccessed, purpose, action: "read" });
  }

  // ── Platform admin: rule registry, model registry, external claims ───────
  eng.registerBlockRule(platform, {
    code: "ECTA-MOISTURE-12.5",
    authorityTag: "OFFICIAL_TECHNICAL_STANDARD",
    sourceRef: "ECTA green coffee export standard — moisture ≤ 12.5%",
    scope: "green coffee dispatch to exporter",
    owner: "Ankuaru compliance team",
    approvalRef: "CAB-2025-031",
    stepUpProof: "ANK-PLATFORM-01",
  });
  const model = {
    owner: "Ankuaru data team",
    trainingData: "2019–2025 station yield records (8 sites, 1,140 events)",
    features: "input kg, output kg, route, moisture, site",
    performance: "precision 0.91 / recall 0.84 on 2024 holdout",
    limitations: "Advisory only; cannot write canonical records (AI write ban)",
    deploymentScope: "FLAG suggestions on processing events",
    monitoringPlan: "Monthly drift review by compliance",
    retirementPath: "Disable in registry; FLAGs stop immediately",
  };
  eng.registerModel(platform, { ...model, modelId: "yield-anomaly-v2", purpose: "Flag unusual processing yields", version: "2.1.0" });
  eng.enableModel(platform, "yield-anomaly-v2");
  eng.registerModel(platform, {
    ...model,
    modelId: "mass-balance-forecast-v1",
    purpose: "Forecast station stock from open receipts",
    version: "1.0.0-rc",
  });
  if (exp2Green) {
    const lot = eng.getLots().find((l) => l.lotId === exp2Green)!;
    eng.ingestExternalClaim(platform, { source: "ECX Addis weighbridge", lotId: lot.lotId, field: "massKg", claimedValue: lot.canonicalMassKg });
  }
  const importerLot = eng.inventory(ctx.importerId)[0];
  if (importerLot) {
    eng.ingestExternalClaim(platform, {
      source: "Gothenburg port scale",
      lotId: importerLot.lotId,
      field: "massKg",
      claimedValue: importerLot.canonicalMassKg - 6,
    });
  }
}

export function serializeSeed(result: SeedResult) {
  const eng = result.engine;
  return {
    exporterId: result.exporterId,
    exporterIds: result.exporterIds,
    importerId: result.importerId,
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
