import { describe, expect, it } from "vitest";

import { isReachStarved } from "./ai-economic-heuristics.js";
import { chooseBestRelayBeaconBuild, type StructurePlannerTile } from "./structure-command-planner.js";

/**
 * Regression cover for the reach-lock deadlock observed on staging: five AI
 * players sat completely idle for 15+ minutes, having claimed every tile
 * inside their reach and holding hundreds of FRONTIER tiles they could never
 * convert. The AI has no standalone SETTLE decision (deliberate), so its only
 * escape is a RELAY_BEACON — and both halves of that escape were blocked:
 *   1. beacon sites were restricted to already-SETTLED tiles, and
 *   2. isReachStarved required !economyWeak, a bar that scales with settled
 *      tile count (x6) while manpower cap scales with towns.
 * These two tests pin the exact live numbers that produced the deadlock.
 */

const tile = (over: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x: 100,
  y: 100,
  terrain: "LAND",
  ownerId: "ai-1",
  ownershipState: "SETTLED",
  ...over
});

const lookupOf = (tiles: readonly StructurePlannerTile[]): Map<string, StructurePlannerTile> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("relay beacon unlocks a reach-locked AI", () => {
  it("selects an owned FRONTIER site and reports needsSettle so the caller settles first", () => {
    // A frontier tile with a resource tile just out of reach beside it — the
    // exact shape of "my only remaining ground is frontier, and there is a
    // prize next to it". Before this change no frontier tile was ever a
    // candidate, so a reach-locked AI found no beacon site at all.
    const site = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const prize = tile({ x: 102, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [site, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan).toBeDefined();
    expect(plan?.tile.x).toBe(100);
    expect(plan?.tile.y).toBe(100);
    expect(plan?.needsSettle).toBe(true);
  });

  it("prefers an equally-placed SETTLED site over a FRONTIER one (no needless settle)", () => {
    const frontierSite = tile({ x: 100, y: 100, ownershipState: "FRONTIER" });
    const settledSite = tile({ x: 100, y: 102, ownershipState: "SETTLED" });
    // One prize reachable from both candidate sites.
    const prize = tile({ x: 100, y: 101, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [frontierSite, settledSite, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 122, townCount: 3 },
      tiles,
      lookupOf(tiles),
      tiles
    );

    expect(plan?.needsSettle).toBe(false);
    expect(plan?.tile.y).toBe(102);
  });

  it("fires for the live staging empire that economyWeak used to veto forever", () => {
    // ai-1 as observed: 122 settled tiles => economyWeak demanded 122*6 = 732
    // manpower, above what its town-scaled cap could sustain, so the beacon
    // was permanently vetoed. With 400 manpower it must now read reach-starved.
    expect(
      isReachStarved({
        reachAccessibleValuableTargetCount: 0,
        townCount: 3,
        manpower: 400,
        needsFood: false,
        frontierEnemyTargetCount: 0
      })
    ).toBe(true);
  });

  it("still refuses when a real affordability floor or a live enemy front says no", () => {
    const base = {
      reachAccessibleValuableTargetCount: 0,
      townCount: 3,
      manpower: 400,
      needsFood: false,
      frontierEnemyTargetCount: 0
    };
    // Below the explicit manpower floor (townCount * 15 = 45).
    expect(isReachStarved({ ...base, manpower: 20 })).toBe(false);
    // Enemy at the frontier — fight, don't build.
    expect(isReachStarved({ ...base, frontierEnemyTargetCount: 4 })).toBe(false);
    // Still has valuable ground it can simply EXPAND onto.
    expect(isReachStarved({ ...base, reachAccessibleValuableTargetCount: 7 })).toBe(false);
  });
});
