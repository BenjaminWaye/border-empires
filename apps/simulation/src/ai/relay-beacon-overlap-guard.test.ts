import { describe, expect, it } from "vitest";

import type { StructurePlannerTile } from "./structure-command-planner.js";
import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";

// Split out of relay-beacon-reach-unlock.test.ts (which was at the repo's
// 500-line file cap) once this guard's own regression coverage grew large
// enough to justify its own file — see that file for the rest of
// chooseBestRelayBeaconBuild's coverage-scoring test suite.

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

const REACH_RADIUS_FOR_TESTS = 5; // mirrors OUTPOST_REACH_RADIUS (config.ts) — not imported to keep this file's fixtures self-contained.

// See relay-beacon-reach-unlock.test.ts's knownVoid for the full doc — fills
// a candidate's scan radius with known, non-LAND filler so unexplored-fog
// scoring doesn't add phantom credit in these fixtures.
const knownVoid = (centers: readonly { x: number; y: number }[], radius = REACH_RADIUS_FOR_TESTS): StructurePlannerTile[] => {
  const seen = new Set<string>();
  const filler: StructurePlannerTile[] = [];
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        filler.push(tile({ x, y, terrain: "SEA", ownerId: undefined, ownershipState: undefined }));
      }
    }
  }
  return filler;
};

describe("relay beacon waits for a nearby under-construction beacon to finish rather than overlapping it", () => {
  // Regression for live clustering: currentReachTileKeys only excludes ground
  // already inside an existing beacon's OWN radius from a candidate's score.
  // A second candidate whose radius reaches a genuinely new prize just past
  // that boundary still scored fine under the old logic even though most of
  // its own future radius would sit on top of the first beacon's — the two
  // reach boxes overlap once both land, so building the second speculatively
  // wastes a dev slot instead of waiting to see what's still uncovered once
  // the first one actually goes active.
  it("refuses a candidate whose future reach box would overlap a same-player beacon still under construction, even with a genuinely new prize in range", () => {
    // existingBeacon's own radius (OUTPOST_REACH_RADIUS = 5) reaches up to
    // x=105 — candidate at x=108 doesn't currently share any covered ground
    // with it (its own radius starts at x=103), but the two centers are only
    // 8 apart, well under the 2*OUTPOST_REACH_RADIUS=10 "boxes will touch"
    // threshold, so their future radii (95-105 and 103-113) overlap on
    // x=103-105 once both are built.
    const existingBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "under_construction" }
    });
    const candidate = tile({ x: 108, y: 100, ownershipState: "SETTLED" });
    // Distance 12 from existingBeacon — outside ITS radius, so not already
    // excluded by currentReachTileKeys — but distance 4 from candidate, a
    // genuinely new prize that would have made candidate score positively
    // under the old logic.
    const prize = tile({ x: 112, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 108, y: 100 }]), existingBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan).toBeUndefined();
  });

  it("still allows a candidate just past the overlap threshold from an under-construction beacon", () => {
    // Centers 11 apart — one past PENDING_OUTPOST_OVERLAP_DISTANCE (10) — so
    // the two future radii (95-105 and 106-116) don't touch at all.
    const existingBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "under_construction" }
    });
    const candidate = tile({ x: 111, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 113, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 111, y: 100 }]), existingBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(111);
    expect(plan?.siteValue).toBe(8);
  });

  it("does not defer to a same-player beacon that has already gone active (its own reach exclusion already handles that)", () => {
    // Active beacons are already handled by currentReachTileKeys' score-based
    // exclusion (relay-beacon-reach-unlock.test.ts) — the overlap veto here
    // only ever needs to apply to still-under_construction ones, since an
    // active beacon's real reach is already fully accounted for in scoring.
    const activeBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    });
    const candidate = tile({ x: 108, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 112, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 108, y: 100 }]), activeBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(108);
    expect(plan?.siteValue).toBe(8);
  });

  it("does not defer to another player's under-construction beacon", () => {
    const enemyBeacon = tile({
      x: 100,
      y: 100,
      ownerId: "ai-2",
      economicStructure: { ownerId: "ai-2", type: "RELAY_BEACON", status: "under_construction" }
    });
    const candidate = tile({ x: 108, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 112, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 108, y: 100 }]), enemyBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(108);
    expect(plan?.siteValue).toBe(8);
  });
});
