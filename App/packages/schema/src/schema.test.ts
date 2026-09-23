import { describe, expect, it } from "vitest";
import {
  DEFAULT_FACILITY_CAPABILITIES,
  FRAMEWORK_VERSIONS,
  PROCESS_CAPABILITY_FOR_OUTPUT,
  SANCTION_LADDER,
  TRANSACTION_CHANNELS,
  YIELD_REFERENCE_RANGES,
  canonicalJson,
} from "./index.js";

describe("canonicalJson", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, undefined], c: "x" }, z: undefined })).toBe(
      canonicalJson({ a: { c: "x", d: [1, null] }, b: 1 }),
    );
  });

  it("keeps array order", () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });
});

describe("reference data", () => {
  it("yield ranges are FLAG benchmarks with a source", () => {
    for (const r of YIELD_REFERENCE_RANGES) {
      expect(r.minPct).toBeLessThan(r.maxPct);
      expect(r.sourceRef).toBeTruthy();
      expect(["LEGAL_REQUIREMENT"]).not.toContain(r.authorityTag);
    }
  });

  it("every process output maps to a capability some default facility has", () => {
    const all = new Set(Object.values(DEFAULT_FACILITY_CAPABILITIES).flat());
    for (const cap of Object.values(PROCESS_CAPABILITY_FOR_OUTPUT)) expect(all.has(cap!)).toBe(true);
  });

  it("only the three legal channels are accepted, all storable in the Prisma enum", () => {
    const prismaEnum = ["primary_transaction_center", "direct_linkage", "ecx", "other"];
    expect(TRANSACTION_CHANNELS).toHaveLength(3);
    for (const c of TRANSACTION_CHANNELS) expect(prismaEnum).toContain(c);
  });

  it("sanction ladder starts at a warning", () => {
    expect(SANCTION_LADDER[0]).toBe("written_warning");
  });

  it("framework versions are ordered and immutable per code", () => {
    const eudr = FRAMEWORK_VERSIONS.filter((f) => f.frameworkCode === "EUDR");
    expect(new Set(eudr.map((f) => f.version)).size).toBe(eudr.length);
    const times = eudr.map((f) => Date.parse(f.effectiveFrom));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
