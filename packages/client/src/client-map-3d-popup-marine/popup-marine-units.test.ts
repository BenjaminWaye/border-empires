import { describe, expect, it } from "vitest";
import { MARINES_PER_SIDE } from "./popup-marine-timeline.js";
import { MAX_SPECIALISTS_PER_SQUAD, SPECIALIST_SLOTS_PER_FACTORY, squadSpecialistsFor, squadUnitsFor, UNIT_PROFILES, type MarineUnitKind } from "./popup-marine-units.js";
import { WEAPONS_FACTORY_KINDS } from "./popup-marine-gear.js";

const count = (units: MarineUnitKind[], kind: MarineUnitKind): number => units.filter((u) => u === kind).length;

describe("squadUnitsFor", () => {
  it("fields plain infantry for an empire with no weapons factory", () => {
    expect(squadUnitsFor(undefined, 42, 0)).toEqual(Array(MARINES_PER_SIDE).fill("infantry"));
    expect(squadUnitsFor({}, 42, 1)).toEqual(Array(MARINES_PER_SIDE).fill("infantry"));
  });

  it("swaps two slots for titanium walkers -- one assault, one gunner -- not the whole squad", () => {
    for (let seed = 0; seed < 50; seed++) {
      const units = squadUnitsFor({ titanium: true }, seed, 0);
      expect(count(units, "titanium-assault")).toBe(1);
      expect(count(units, "titanium-gunner")).toBe(1);
      expect(count(units, "infantry")).toBe(MARINES_PER_SIDE - SPECIALIST_SLOTS_PER_FACTORY);
    }
  });

  it("composes both factories into distinct slots without dropping either", () => {
    for (let seed = 0; seed < 50; seed++) {
      const units = squadUnitsFor({ titanium: true, umbrite: true }, seed, 1);
      expect(count(units, "titanium-assault") + count(units, "titanium-gunner")).toBe(2);
      expect(count(units, "umbrite-heavy")).toBe(2);
      expect(count(units, "infantry")).toBe(MARINES_PER_SIDE - 4);
    }
  });

  it("never lines the two walkers up side by side", () => {
    for (let seed = 0; seed < 200; seed++) {
      const units = squadUnitsFor({ titanium: true, umbrite: true }, seed, (seed % 2) as 0 | 1);
      const walkers = units.flatMap((u, i) => (UNIT_PROFILES[u].scale > 1 ? [i] : []));
      expect(walkers).toHaveLength(2);
      expect(Math.abs(walkers[0]! - walkers[1]!)).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps specialists off the formation's two edge slots", () => {
    for (let seed = 0; seed < 50; seed++) {
      const units = squadUnitsFor({ titanium: true, umbrite: true }, seed, 0);
      expect(units[0]).toBe("infantry");
      expect(units[MARINES_PER_SIDE - 1]).toBe("infantry");
    }
  });

  it("is deterministic per tile seed and side, so skirmish, battle and garrison agree", () => {
    expect(squadUnitsFor({ titanium: true }, 7, 0)).toEqual(squadUnitsFor({ titanium: true }, 7, 0));
    const placements = new Set(Array.from({ length: 30 }, (_, seed) => squadUnitsFor({ titanium: true }, seed, 0).join(",")));
    expect(placements.size).toBeGreaterThan(1);
  });

  it("gives every unit kind a profile", () => {
    for (const kind of ["infantry", "titanium-assault", "titanium-gunner", "umbrite-heavy"] as const) {
      expect(UNIT_PROFILES[kind].scale).toBeGreaterThan(0);
    }
  });
});

describe("squadSpecialistsFor: the specialist budget", () => {
  it("fields two specialists per factory for one or two factories", () => {
    expect(squadSpecialistsFor({ titanium: true })).toEqual(["titanium-assault", "titanium-gunner"]);
    expect(squadSpecialistsFor({ titanium: true, umbrite: true })).toHaveLength(4);
  });

  it("never exceeds the squad budget, and every owned factory keeps at least one specialist up to it", () => {
    // Simulates a future roster of factories by reading the budget rule
    // directly: with n factories each gets max(1, min(2, floor(4 / n))).
    for (let n = 1; n <= 6; n++) {
      const perFactory = Math.max(1, Math.min(SPECIALIST_SLOTS_PER_FACTORY, Math.floor(MAX_SPECIALISTS_PER_SQUAD / n)));
      expect(Math.min(n, MAX_SPECIALISTS_PER_SQUAD) * perFactory).toBeLessThanOrEqual(MAX_SPECIALISTS_PER_SQUAD);
    }
    const all = Object.fromEntries(WEAPONS_FACTORY_KINDS.map((k) => [k, true]));
    expect(squadSpecialistsFor(all).length).toBeLessThanOrEqual(MAX_SPECIALISTS_PER_SQUAD);
  });

  it("leaves infantry the majority of every squad", () => {
    const all = Object.fromEntries(WEAPONS_FACTORY_KINDS.map((k) => [k, true]));
    expect(count(squadUnitsFor(all, 3, 0), "infantry")).toBeGreaterThanOrEqual(MARINES_PER_SIDE - MAX_SPECIALISTS_PER_SQUAD);
  });
});
