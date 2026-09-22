import { describe, expect, it } from "vitest";
import { assertDualAttribution } from "./index.js";

describe("field channel", () => {
  it("T3 assisted entry dual attribution", () => {
    expect(() => assertDualAttribution("", "actor")).toThrow();
    expect(() => assertDualAttribution("user", "actor")).not.toThrow();
  });
});
