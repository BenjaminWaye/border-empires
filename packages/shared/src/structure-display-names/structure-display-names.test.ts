import { describe, expect, it } from "vitest";

import { structureDisplayName } from "./structure-display-names.js";

describe("structureDisplayName", () => {
  it("returns the player-facing name for renamed structures", () => {
    expect(structureDisplayName("CARAVANARY")).toBe("Trade Nexus");
    expect(structureDisplayName("GRANARY")).toBe("Incubation Engine");
    expect(structureDisplayName("WOODEN_FORT")).toBe("Palisade");
    expect(structureDisplayName("SIEGE_OUTPOST")).toBe("Siege Battery");
  });

  it("humanizes an unknown id instead of showing the raw constant", () => {
    expect(structureDisplayName("SOME_FUTURE_HALL")).toBe("Some future hall");
  });

  it("does not resolve inherited object keys as structure names", () => {
    expect(structureDisplayName("constructor")).toBe("Constructor");
  });
});
