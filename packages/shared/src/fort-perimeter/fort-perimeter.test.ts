import { describe, expect, it } from "vitest";

import { WORLD_WIDTH } from "../config.js";
import { buildFrontierCombatPreview } from "../frontier-combat/frontier-combat.js";
import type { FortVariant } from "../types.js";
import { type FortPerimeterTileFacts, fortPerimeterDefenseMult, fortPerimeterSourceVariant } from "./fort-perimeter.js";

const NOW = 1_000_000;
const fortAt = (variant: FortVariant, ownerId = "p1", extra: Partial<NonNullable<FortPerimeterTileFacts["fort"]>> = {}): FortPerimeterTileFacts => ({
  ownerId,
  fort: { ownerId, status: "active", variant, ...extra }
});
const lookupFrom = (tiles: Record<string, FortPerimeterTileFacts>) => (x: number, y: number) => tiles[`${x},${y}`];

describe("fortPerimeterDefenseMult", () => {
  it("gives a third of the bonus for Palisade/Fort and a quarter for the Bastions", () => {
    expect(fortPerimeterDefenseMult("PALISADE")).toBeCloseTo(1 + 0.35 / 3);
    expect(fortPerimeterDefenseMult("FORT")).toBeCloseTo(1.5);
    expect(fortPerimeterDefenseMult("TITANIUM_BASTION")).toBeCloseTo(1.75);
    expect(fortPerimeterDefenseMult("THUNDER_BASTION")).toBeCloseTo(2.375);
  });

  it("scales with the defender's fort tech multiplier", () => {
    expect(fortPerimeterDefenseMult("FORT", 1.2)).toBeCloseTo(1 + (3 - 1) / 3);
  });
});

describe("fortPerimeterSourceVariant", () => {
  it("covers radius 1 for a Fort but not radius 2", () => {
    const lookup = lookupFrom({ "10,10": fortAt("FORT") });
    expect(fortPerimeterSourceVariant("p1", 11, 11, lookup, NOW)).toBe("FORT");
    expect(fortPerimeterSourceVariant("p1", 12, 10, lookup, NOW)).toBeUndefined();
  });

  it("covers radius 2 for a Titanium Bastion", () => {
    const lookup = lookupFrom({ "10,10": fortAt("TITANIUM_BASTION") });
    expect(fortPerimeterSourceVariant("p1", 12, 8, lookup, NOW)).toBe("TITANIUM_BASTION");
    expect(fortPerimeterSourceVariant("p1", 13, 10, lookup, NOW)).toBeUndefined();
  });

  it("never covers the fort's own tile", () => {
    expect(fortPerimeterSourceVariant("p1", 10, 10, lookupFrom({ "10,10": fortAt("FORT") }), NOW)).toBeUndefined();
  });

  it("picks the strongest perimeter instead of stacking", () => {
    const lookup = lookupFrom({ "10,10": fortAt("PALISADE"), "12,10": fortAt("FORT") });
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookup, NOW)).toBe("FORT");
  });

  it("ignores other owners' forts, forts under construction, disabled forts and unusable forts", () => {
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookupFrom({ "10,10": fortAt("FORT", "p2") }), NOW)).toBeUndefined();
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookupFrom({ "10,10": fortAt("FORT", "p1", { status: "under_construction" }) }), NOW)).toBeUndefined();
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookupFrom({ "10,10": fortAt("FORT", "p1", { disabledUntil: NOW + 1 }) }), NOW)).toBeUndefined();
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookupFrom({ "10,10": fortAt("FORT") }), NOW, () => false)).toBeUndefined();
  });

  it("keeps the old tier's perimeter while an upgrade is under construction", () => {
    const lookup = lookupFrom({ "10,10": fortAt("TITANIUM_BASTION", "p1", { status: "under_construction", upgradingFrom: "FORT" }) });
    expect(fortPerimeterSourceVariant("p1", 11, 10, lookup, NOW)).toBe("FORT");
    expect(fortPerimeterSourceVariant("p1", 12, 10, lookup, NOW)).toBeUndefined();
  });

  it("wraps across the map edge", () => {
    const lookup = lookupFrom({ [`${WORLD_WIDTH - 1},5`]: fortAt("FORT") });
    expect(fortPerimeterSourceVariant("p1", 0, 5, lookup, NOW)).toBe("FORT");
  });
});

describe("fort perimeter in combat", () => {
  const settled = { terrain: "LAND", ownershipState: "SETTLED" } as const;
  const defenseFort = (tile: Parameters<typeof buildFrontierCombatPreview>[0]) =>
    buildFrontierCombatPreview(tile, { nowMs: NOW }).defender.battle.find((e) => e.label.startsWith("Fort"));

  it("adds a Fort perimeter term to a garrisoned tile next to a Fort", () => {
    const plain = buildFrontierCombatPreview(settled, { nowMs: NOW }).defMult;
    const covered = buildFrontierCombatPreview({ ...settled, fortPerimeterVariant: "FORT" }, { nowMs: NOW });
    expect(covered.defMult).toBeCloseTo(plain * 1.5);
    expect(defenseFort({ ...settled, fortPerimeterVariant: "FORT" })?.label).toBe("Fort perimeter (FORT)");
  });

  it("does not defend frontier ground", () => {
    expect(buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "FRONTIER", fortPerimeterVariant: "FORT" }, { nowMs: NOW }).defMult).toBe(0);
  });

  it("does not stack with the tile's own fort; the stronger one applies", () => {
    expect(defenseFort({ ...settled, fortVariant: "FORT", fortPerimeterVariant: "FORT" })).toEqual({ label: "Fort (FORT)", mult: 2.5 });
    expect(defenseFort({ ...settled, fortVariant: "PALISADE", fortPerimeterVariant: "FORT" })?.label).toBe("Fort perimeter (FORT)");
  });
});
