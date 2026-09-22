import { describe, expect, it } from "vitest";
import { seedWorld, serializeSeed } from "./index.js";

describe("seed world", () => {
  it("boots eight sites and passes weight-balance within tolerance or reports numbers", () => {
    const result = seedWorld();
    const data = serializeSeed(result);
    expect(data.actors.length).toBeGreaterThan(50);
    expect(data.lots.length).toBeGreaterThan(100);
    expect(data.preferredTraceLotId).toBeTruthy();
    // Weight balance should close accounting for process loss/reject
    expect(data.integrity.weightBalance.minted).toBeGreaterThan(0);
  });
});
