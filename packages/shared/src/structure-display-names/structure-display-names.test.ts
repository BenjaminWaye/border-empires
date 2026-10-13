import { describe, expect, it } from "vitest";

import { structureDisplayName } from "./structure-display-names.js";

describe("structureDisplayName", () => {
  it("returns the player-facing name for renamed structures", () => {
    expect(structureDisplayName("TRADE_NEXUS")).toBe("Trade Nexus");
    expect(structureDisplayName("INCUBATION_ENGINE")).toBe("Incubation Engine");
    expect(structureDisplayName("PALISADE")).toBe("Palisade");
    expect(structureDisplayName("SIEGE_BATTERY")).toBe("Siege Battery");
  });

  it("humanizes an unknown id instead of showing the raw constant", () => {
    expect(structureDisplayName("SOME_FUTURE_HALL")).toBe("Some future hall");
  });

  it("does not resolve inherited object keys as structure names", () => {
    expect(structureDisplayName("constructor")).toBe("Constructor");
  });
});
