import { describe, expect, it } from "vitest";
import { INCUBATION_ENGINE_INSTANT_POPULATION_BURST, INCUBATION_ENGINE_ONGOING_GROWTH_MULT } from "@border-empires/shared";
import { structureInfoForKey } from "../client-map-display.js";

describe("current population structure descriptions", () => {
  const deps = { formatCooldownShort: (ms: number) => String(ms), prettyToken: (value: string) => value };
  it("describes Incubation Engine population effects and never claims food production or efficiency", () => {
    const info = structureInfoForKey("INCUBATION_ENGINE", deps);
    expect(info.detail).toContain(`+${INCUBATION_ENGINE_INSTANT_POPULATION_BURST.toLocaleString("en-US")} population`);
    expect(info.detail).toContain(`+${Math.round((INCUBATION_ENGINE_ONGOING_GROWTH_MULT - 1) * 100)}%`);
    expect(info.detail).toContain("once, on completion");
    expect(info.detail).not.toMatch(/food|hydrogarden|upkeep/i);
    expect(info.glyph).not.toBe("🍞");
  });
  it("describes Census Hall capacity and upgrade benefits instead of a retired growth bonus", () => {
    const info = structureInfoForKey("CENSUS_HALL", deps);
    expect(info.detail).toContain("population capacity");
    expect(info.detail).toContain("Incubation Engine");
    expect(info.detail).toContain("town-tier upgrade");
    expect(info.detail).not.toContain("25% local population growth");
  });
});
