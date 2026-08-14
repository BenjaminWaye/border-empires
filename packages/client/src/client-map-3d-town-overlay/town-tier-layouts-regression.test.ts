import { describe, expect, it } from "vitest";
import { SETTLEMENT_LAYOUT, TOWN_LAYOUT, CITY_LAYOUT } from "./town-tier-cities.js";
import { GREAT_CITY_LAYOUT, METROPOLIS_LAYOUT } from "./town-tier-capitals.js";
import { TOWN_SLOT_DEFS, type TownLayout, type TownSlotKey } from "./town-tier-shapes.js";

const ALL_LAYOUTS: Record<string, TownLayout> = {
  SETTLEMENT: SETTLEMENT_LAYOUT,
  TOWN: TOWN_LAYOUT,
  CITY: CITY_LAYOUT,
  GREAT_CITY: GREAT_CITY_LAYOUT,
  METROPOLIS: METROPOLIS_LAYOUT
};

const SLOT_KEYS = new Set<TownSlotKey>(TOWN_SLOT_DEFS.map((def) => def.key));
const SLOT_KNOWN = new Set<string>(TOWN_SLOT_DEFS.map((def) => def.kind));

describe("steampunk town tier layouts", () => {
  it("defines all five town tiers and every tier has a non-empty layout", () => {
    expect(Object.keys(ALL_LAYOUTS)).toEqual(["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]);
    for (const [tier, layout] of Object.entries(ALL_LAYOUTS)) {
      expect(layout.length, `${tier} layout should not be empty`).toBeGreaterThan(0);
    }
  });

  it("references only slots registered in TOWN_SLOT_DEFS and covers both material kinds", () => {
    expect(SLOT_KNOWN).toEqual(new Set(["iron", "aether", "amber"]));
    for (const [tier, layout] of Object.entries(ALL_LAYOUTS)) {
      for (const piece of layout) {
        expect(SLOT_KEYS.has(piece.slot), `${tier} uses unregistered slot "${piece.slot}"`).toBe(true);
      }
    }
  });

  it("keeps every piece inside the tile footprint", () => {
    for (const [tier, layout] of Object.entries(ALL_LAYOUTS)) {
      for (const piece of layout) {
        expect(Math.abs(piece.x), `${tier} x=${piece.x}`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(piece.z), `${tier} z=${piece.z}`).toBeLessThanOrEqual(0.5);
        expect(piece.y, `${tier} y must be non-negative`).toBeGreaterThanOrEqual(0);
        expect(piece.sy, `${tier} scale-y must be positive`).toBeGreaterThan(0);
      }
    }
  });

  it("does not regress back to the old generic house-count tiers", () => {
    for (const layout of Object.values(ALL_LAYOUTS)) {
      const slots = new Set(layout.map((p) => p.slot));
      expect(slots.has("gear")).toBe(true);
      expect(slots.has("aetherLamp") || slots.has("aetherBeam") || slots.has("aetherOrb")).toBe(true);
    }
  });

  it("keeps the GPU instance budget bounded (no unnecessary overlay load)", () => {
    const totalFactor = TOWN_SLOT_DEFS.reduce((sum, def) => sum + def.factor, 0);
    // At maxTiles 14000 this caps total preallocated instance matrices well
    // below the old hut/tower system while keeping each slot usable.
    expect(totalFactor).toBeLessThanOrEqual(35);
    for (const def of TOWN_SLOT_DEFS) {
      expect(def.factor, `${def.key} factor`).toBeGreaterThanOrEqual(0.5);
      expect(def.factor, `${def.key} factor`).toBeLessThanOrEqual(4);
    }
    for (const [tier, layout] of Object.entries(ALL_LAYOUTS)) {
      expect(layout.length, `${tier} piece count`).toBeLessThanOrEqual(200);
    }
  });

  it("the metropolis Monument towers above every other tier", () => {
    const sceneTop = (layout: TownLayout): number =>
      Math.max(
        0,
        ...layout.map((p) => p.y + Math.abs(p.sy) * 0.5)
      );
    const metropolisTop = sceneTop(METROPOLIS_LAYOUT);
    const greatCityTop = sceneTop(GREAT_CITY_LAYOUT);
    const cityTop = sceneTop(CITY_LAYOUT);
    const townTop = sceneTop(TOWN_LAYOUT);
    // Monument core: pylon to ~1.48 + orb/glow cap.
    expect(metropolisTop).toBeGreaterThanOrEqual(1.35);
    expect(metropolisTop).toBeGreaterThan(greatCityTop);
    expect(greatCityTop).toBeGreaterThan(cityTop);
    expect(cityTop).toBeGreaterThan(townTop);
  });
});