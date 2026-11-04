import { describe, expect, it } from "vitest";
import { WAR_SCAR_MAX_LEVEL } from "@border-empires/shared";
import { LAYOUTS } from "../client-map-3d-forest.js";
import { FOREST_WAR_VARIANTS, forestLayoutAt, standingTreeFilter, treeFate } from "./forest-war.js";
import type { Tile } from "../client-types.js";

const SLOTS = 9;
const destroyedAt = (variant: number, level: number): number[] =>
  Array.from({ length: SLOTS }, (_, slot) => slot).filter((slot) => treeFate(variant, level, slot) !== "standing");

describe("war in a forest", () => {
  it("destroys more of the forest with every battle, and a destroyed tree stays destroyed", () => {
    for (let variant = 0; variant < FOREST_WAR_VARIANTS; variant += 1) {
      expect(destroyedAt(variant, 0)).toEqual([]);
      for (let level = 1; level < WAR_SCAR_MAX_LEVEL; level += 1) {
        const before = destroyedAt(variant, level);
        const after = destroyedAt(variant, level + 1);
        expect(after.length).toBeGreaterThanOrEqual(before.length);
        for (const slot of before) expect(after).toContain(slot);
        // Each tree keeps the same fate as the scars deepen.
        for (const slot of before) expect(treeFate(variant, level + 1, slot)).toBe(treeFate(variant, level, slot));
      }
    }
    const total = (level: number) => Array.from({ length: FOREST_WAR_VARIANTS }, (_, v) => destroyedAt(v, level).length).reduce((a, b) => a + b, 0);
    expect(total(WAR_SCAR_MAX_LEVEL)).toBeGreaterThan(total(1));
  });

  it("keeps the whole forest standing without live scars or under fog", () => {
    expect(standingTreeFilter({}, 3, 4)).toBeUndefined();
    expect(standingTreeFilter({ warScarLevel: 3, warScarUntil: 1 }, 3, 4, 2)).toBeUndefined();
    expect(standingTreeFilter({ warScarLevel: 3, warScarUntil: 10, fogged: true } as Tile, 3, 4, 2)).toBeUndefined();
  });

  it("removes exactly the destroyed trees from a scarred forest", () => {
    const { variant } = forestLayoutAt(3, 4, false);
    const keep = standingTreeFilter({ warScarLevel: 5, warScarUntil: 10 }, 3, 4, 2)!;
    for (let slot = 0; slot < SLOTS; slot += 1) expect(keep(slot)).toBe(treeFate(variant, 5, slot) === "standing");
  });

  it("matches the forest's own layout and species", () => {
    const at = forestLayoutAt(12, 30, false);
    expect(at.layout).toBeLessThan(LAYOUTS.length);
    expect(["pine", "spruce", "leaf"]).toContain(at.species);
    expect(forestLayoutAt(12, 30, true).species).toBe("palm");
  });
});
