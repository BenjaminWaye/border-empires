import { describe, expect, it } from "vitest";

import { SUPPORT_DEFENSE_BASE, SUPPORT_DEFENSE_STEP } from "./config.js";
import { supportDefenseMult } from "./frontier-combat.js";
import { friendlySettledSupport, type NeighbourLookup, type TileFacts } from "./local-support.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeLookup = (
  tiles: Array<{ x: number; y: number; terrain?: string; ownerId?: string; ownershipState?: string }>
): NeighbourLookup => {
  const map = new Map(tiles.map(t => [`${t.x},${t.y}`, t]));
  return (x, y) => map.get(`${x},${y}`);
};

const noAlly = (): boolean => false;
const allyFn = (a: string, b: string): boolean => a !== b && b.startsWith("ally");

// A convenience center tile that sits at (5,5) and is owned by "p1".
const center: TileFacts = { x: 5, y: 5, ownerId: "p1" };

// ---------------------------------------------------------------------------
// friendlySettledSupport
// ---------------------------------------------------------------------------

describe("friendlySettledSupport", () => {
  it("returns 0 when center has no owner", () => {
    const result = friendlySettledSupport({ x: 5, y: 5 }, makeLookup([]), noAlly);
    expect(result).toBe(0);
  });

  it("returns 0 for a lone settled tile with no backing neighbours", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" },
      { x: 6, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" },
      { x: 5, y: 6, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" },
      { x: 4, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(0);
  });

  it("returns 4 when all 4 cardinal neighbours are friendly-settled", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 6, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 5, y: 6, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 4, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(4);
  });

  it("counts an ally-owned SETTLED neighbour as backed", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "LAND", ownerId: "ally-2", ownershipState: "SETTLED" }
    ]);
    expect(friendlySettledSupport(center, lookup, allyFn)).toBe(1);
  });

  it("counts a SEA neighbour as a barrier (backed)", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "SEA" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(1);
  });

  it("counts a COASTAL_SEA neighbour as a barrier (backed)", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "COASTAL_SEA" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(1);
  });

  it("counts a MOUNTAIN neighbour as a barrier (backed)", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "MOUNTAIN" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(1);
  });

  it("does NOT count a friendly-FRONTIER neighbour as backed", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(0);
  });

  it("does NOT count an enemy-SETTLED neighbour as backed", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" }
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(0);
  });

  it("returns undefined-safe 0 when neighbour is missing from lookup", () => {
    // Empty lookup — all four neighbours undefined
    expect(friendlySettledSupport(center, makeLookup([]), noAlly)).toBe(0);
  });

  it("counts a mix of barrier + friendly-settled correctly", () => {
    const lookup = makeLookup([
      { x: 5, y: 4, terrain: "SEA" },                                          // barrier
      { x: 6, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }, // friendly
      { x: 5, y: 6, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" }, // enemy
      { x: 4, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }   // frontier
    ]);
    expect(friendlySettledSupport(center, lookup, noAlly)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// supportDefenseMult
// ---------------------------------------------------------------------------

describe("supportDefenseMult", () => {
  it("equals SUPPORT_DEFENSE_BASE at support=0", () => {
    expect(supportDefenseMult(0)).toBeCloseTo(SUPPORT_DEFENSE_BASE, 10);
  });

  it("equals SUPPORT_DEFENSE_BASE + 4*SUPPORT_DEFENSE_STEP at support=4", () => {
    expect(supportDefenseMult(4)).toBeCloseTo(SUPPORT_DEFENSE_BASE + 4 * SUPPORT_DEFENSE_STEP, 10);
  });

  it("is monotonically increasing from 0 to 4", () => {
    for (let i = 0; i < 4; i++) {
      expect(supportDefenseMult(i + 1)).toBeGreaterThan(supportDefenseMult(i));
    }
  });

  it("clamps at support=0 for negative input", () => {
    expect(supportDefenseMult(-1)).toBeCloseTo(SUPPORT_DEFENSE_BASE, 10);
    expect(supportDefenseMult(-100)).toBeCloseTo(SUPPORT_DEFENSE_BASE, 10);
  });

  it("clamps at support=4 for input above 4", () => {
    expect(supportDefenseMult(5)).toBeCloseTo(SUPPORT_DEFENSE_BASE + 4 * SUPPORT_DEFENSE_STEP, 10);
    expect(supportDefenseMult(100)).toBeCloseTo(SUPPORT_DEFENSE_BASE + 4 * SUPPORT_DEFENSE_STEP, 10);
  });
});
