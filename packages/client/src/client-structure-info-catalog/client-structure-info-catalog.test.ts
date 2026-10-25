import { describe, expect, it } from "vitest";
import { FORT_TIER_LADDER, STRUCTURE_REGISTRY, structureDisplayName } from "@border-empires/shared";
import { structureInfoForKey, type StructureInfoKey } from "../client-map-display.js";

const deps = { formatCooldownShort: (ms: number) => String(ms), prettyToken: (text: string) => text };
describe("current structure names and descriptions", () => {
  it("uses the canonical name for every active registry entry", () => {
    for (const key of Object.keys(STRUCTURE_REGISTRY)) {
      const view = structureInfoForKey(key as StructureInfoKey, deps);
      expect(view.title, key).toBe(structureDisplayName(key));
      expect(view.detail.length, key).toBeGreaterThan(30);
    }
  });
  it("describes Thunder Bastion using its actual defense multiplier", () => {
    const info = structureInfoForKey("THUNDER_BASTION", deps);
    expect(info.detail).toContain(`${FORT_TIER_LADDER.THUNDER_BASTION.defenseMult}x`);
    expect(info.detail).not.toContain("8x");
  });
  it("describes Depot network amplification without the retired flat bonus", () => {
    const info = structureInfoForKey("ANCILLARY_DEPOT", deps);
    expect(info.detail).toContain("Reserve Lattice");
    expect(info.detail).not.toContain("+300");
  });
  it("labels both retired types honestly instead of inviting new construction", () => {
    for (const key of ["WEAPONS_WORKSHOP", "QUARTERMASTERS_OFFICE"] as const) {
      const info = structureInfoForKey(key, deps);
      expect(info.detail).toMatch(/retired/i);
      expect(info.effects.join(" ")).not.toContain("build as many as you like");
    }
  });
});
