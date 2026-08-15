import { describe, expect, it } from "vitest";

import { TOWN_SLOT_DEFS, TOWN_TIERS, type TownLayout, type TownTier } from "./town-tier-shapes.js";
import { TOWN_LAYOUTS } from "./town-tier-capitals.js";

const topHeight = (layout: TownLayout): number => {
  let top = 0;
  for (const piece of layout.pieces) {
    const def = TOWN_SLOT_DEFS[piece.slot];
    const h = piece.y + (piece.sy ?? 1) * def.apex;
    top = Math.max(top, h);
  }
  return top;
};

describe("town-tier layouts", () => {
  it("defines all five tiers and each layout is non-empty", () => {
    for (const tier of TOWN_TIERS) {
      expect(TOWN_LAYOUTS[tier], `layout for ${tier}`).toBeDefined();
      expect(TOWN_LAYOUTS[tier].pieces.length, `pieces for ${tier}`).toBeGreaterThan(0);
    }
  });

  it.each(TOWN_TIERS)("layout %s only uses registered slots and every material kind", (tier) => {
    const layout = TOWN_LAYOUTS[tier];
    const slots = layout.pieces.map((p) => p.slot);
    const kinds = new Set(layout.pieces.map((p) => TOWN_SLOT_DEFS[p.slot].kind));
    for (const slot of slots) {
      expect(TOWN_SLOT_DEFS[slot], `unregistered slot ${slot} in ${tier}`).toBeDefined();
    }
    expect(kinds.size, `material kinds in ${tier}`).toBe(3);
  });

  it.each(TOWN_TIERS)("layout %s fits the tile (x/z within ±0.5, y ≥ 0, positive scales)", (tier) => {
    const layout = TOWN_LAYOUTS[tier];
    for (const piece of layout.pieces) {
      expect(Math.abs(piece.x), `${tier} x`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(piece.z), `${tier} z`).toBeLessThanOrEqual(0.5);
      expect(piece.y, `${tier} y`).toBeGreaterThanOrEqual(0);
      expect((piece.sx ?? 1) > 0 && (piece.sy ?? 1) > 0 && (piece.sz ?? 1) > 0, `${tier} scale`).toBe(true);
    }
  });

  it.each(TOWN_TIERS)("layout %s keeps both a gear and an aether glow — no generic-hut regression", (tier) => {
    const layout = TOWN_LAYOUTS[tier];
    const hasGear = layout.pieces.some((p) => p.slot === "gear");
    const hasAether = layout.pieces.some((p) => TOWN_SLOT_DEFS[p.slot].kind === "aether");
    expect(hasGear, `${tier} uses a gear`).toBe(true);
    expect(hasAether, `${tier} uses an aether glow`).toBe(true);
  });

  it("keeps instancing budget: slot factor ≥ worst tier usage, total ≤ 200, ≤ 250 pieces, colors only for iron", () => {
    const usage = new Map<string, Map<TownTier, number>>();
    for (const tier of TOWN_TIERS) {
      const layout = TOWN_LAYOUTS[tier];
      expect(layout.pieces.length, `pieces in ${tier}`).toBeLessThanOrEqual(250);
      for (const piece of layout.pieces) {
        const perTier = usage.get(piece.slot) ?? new Map<TownTier, number>();
        perTier.set(tier, (perTier.get(tier) ?? 0) + 1);
        usage.set(piece.slot, perTier);
        if (TOWN_SLOT_DEFS[piece.slot].kind !== "iron") {
          expect(piece.color, `color on non-iron slot ${piece.slot} in ${tier}`).toBeUndefined();
        }
      }
    }
    let totalFactor = 0;
    for (const [slot, def] of Object.entries(TOWN_SLOT_DEFS) as Array<[keyof typeof TOWN_SLOT_DEFS, (typeof TOWN_SLOT_DEFS)[keyof typeof TOWN_SLOT_DEFS]]>) {
      const worst = Math.max(...[...(usage.get(slot)?.values() ?? [])]);
      expect(def.factor, `factor of ${slot} covers worst tier usage ${worst}`).toBeGreaterThanOrEqual(worst);
      totalFactor += def.factor;
    }
    expect(totalFactor).toBeLessThanOrEqual(200);
  });

  it("ranks skyline height strictly: metropolis > great-city > city > town > settlement", () => {
    const heights: Record<TownTier, number> = {
      SETTLEMENT: topHeight(TOWN_LAYOUTS.SETTLEMENT),
      TOWN: topHeight(TOWN_LAYOUTS.TOWN),
      CITY: topHeight(TOWN_LAYOUTS.CITY),
      GREAT_CITY: topHeight(TOWN_LAYOUTS.GREAT_CITY),
      METROPOLIS: topHeight(TOWN_LAYOUTS.METROPOLIS)
    };
    expect(heights.METROPOLIS).toBeGreaterThanOrEqual(1.35);
    expect(heights.METROPOLIS).toBeGreaterThan(heights.GREAT_CITY);
    expect(heights.GREAT_CITY).toBeGreaterThan(heights.CITY);
    expect(heights.CITY).toBeGreaterThan(heights.TOWN);
    expect(heights.TOWN).toBeGreaterThan(heights.SETTLEMENT);
  });
});