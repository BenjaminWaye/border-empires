import { overrideTerrainAt, setWorldSeed } from "@border-empires/shared";
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

describe("relay beacon rejects a redundant site already inside the player's own current reach", () => {
  // Regression for live clustering: the candidate loop only checked each
  // SCAN-BOX neighbor against reachTileKeys (estimateNewReachCoverage) — the
  // candidate tile itself was never checked. A tile deep inside an existing
  // active beacon's reach could still clear newCoverage.score > 0 from a
  // sliver of plain land/fog at the far edge of its own radius, landing a
  // second beacon nested inside the first one's coverage that reaches
  // nothing of real value (confirmed live: beacons built inside other
  // beacons' vision with near-zero value). Sitting inside existing reach is
  // NOT by itself disqualifying — that's the normal case for any beacon
  // built from already-held ground — so this only fires when the only new
  // coverage on offer is plain land/fog, never when a real prize is found
  // (see the "still allows ... when it reaches a genuine new prize" case).
  it("refuses a candidate sitting inside an already-active beacon's own reach when it only reaches plain land, not a real prize", () => {
    // activeBeacon's own OUTPOST_REACH_RADIUS (5) covers x=95-105. candidate
    // at x=102 sits well inside that box. candidate's own scan radius
    // (x=97-107) reaches only plain, non-valuable unowned land at x=107 —
    // under the old logic that alone was enough to clear newCoverage.score > 0.
    const activeBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    });
    const candidate = tile({ x: 102, y: 100, ownershipState: "SETTLED" });
    const plainLand = tile({ x: 107, y: 100, ownerId: undefined, ownershipState: undefined });
    const tiles = [...knownVoid([{ x: 100, y: 100 }, { x: 102, y: 100 }]), activeBeacon, candidate, plainLand];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan).toBeUndefined();
  });

  it("still allows a candidate sitting inside an already-active beacon's own reach when it reaches a genuine new prize", () => {
    // Same nested geometry as above, but the newly-reached tile is a real
    // resource — a redundant-looking site is still worth building if it
    // actually unlocks unclaimed value the first beacon's radius doesn't cover.
    const activeBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    });
    const candidate = tile({ x: 102, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 107, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 100, y: 100 }, { x: 102, y: 100 }]), activeBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(102);
  });

  it("still allows a candidate just outside an already-active beacon's own reach", () => {
    // activeBeacon's own radius covers x=95-105. candidate at x=106 is one
    // tile past that boundary — genuinely new ground, not nested inside the
    // first beacon's coverage.
    const activeBeacon = tile({
      x: 100,
      y: 100,
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    });
    const candidate = tile({ x: 106, y: 100, ownershipState: "SETTLED" });
    const prize = tile({ x: 111, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 100, y: 100 }, { x: 106, y: 100 }]), activeBeacon, candidate, prize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(106);
  });
});

describe("relay beacon fog-of-war coverage credit ignores tiles that are actually permanent ocean", () => {
  // Regression for live clustering along coastlines: a neighbor absent from
  // tilesByKey (never delivered to this player) was always credited as
  // "might hide land" (UNEXPLORED_TILE_COVERAGE_WEIGHT), even when it was
  // provably permanent SEA/COASTAL_SEA per the world's own deterministic
  // terrain generator (terrainAt) — the same fog-independent source
  // dock-sea-routes.ts already uses. That let a beacon hugging a coastline
  // or a lake bank up phantom score from water it can never turn into
  // anything, on top of already sitting well inside existing reach.
  it("does not credit fog score to undelivered tiles that terrainAt confirms are ocean", () => {
    setWorldSeed(4242);
    const center = { x: 300, y: 300 };
    // Force the candidate's entire scan box to permanent SEA except one
    // genuinely-LAND fog tile just past the reach exclusion, so the only
    // possible positive score would have to come from that single real land
    // tile (weight 4) — not from the surrounding ocean.
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        overrideTerrainAt(center.x + dx, center.y + dy, "SEA");
      }
    }
    overrideTerrainAt(center.x + 5, center.y, "LAND");
    const candidate = tile({ x: center.x, y: center.y, ownershipState: "SETTLED" });
    const tiles = [candidate];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    // One fogged real-LAND tile still clears the veto (siteValue reflects the
    // single UNEXPLORED_TILE_COVERAGE_WEIGHT credit), proving the ocean tiles
    // around it contributed nothing.
    expect(plan?.siteValue).toBe(4);
  });

  it("scores zero and refuses when every undelivered neighbor is confirmed ocean", () => {
    setWorldSeed(4343);
    const center = { x: 400, y: 400 };
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        overrideTerrainAt(center.x + dx, center.y + dy, "SEA");
      }
    }
    const candidate = tile({ x: center.x, y: center.y, ownershipState: "SETTLED" });
    const tiles = [candidate];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan).toBeUndefined();
  });
});

describe("relay beacon coverage does not credit another player's owned land", () => {
  // Regression: EXPAND/reach-based claiming can never take a tile another
  // player already owns (rejected with EXPAND_TARGET_OWNED,
  // packages/game-domain/src/index/index.ts) — only ATTACK captures owned
  // ground, and that only requires being within attack range, not a beacon.
  // estimateNewReachCoverage used to credit any non-self-owned LAND tile
  // (including enemy-owned) as "new coverage," so a beacon candidate could
  // score purely off land it could never actually claim this way.
  it("does not credit an enemy-owned tile toward a beacon's new-coverage score", () => {
    const candidate = tile({ x: 100, y: 100, ownershipState: "SETTLED" });
    const enemyTile = tile({ x: 103, y: 100, ownerId: "ai-2", ownershipState: "SETTLED" });
    const tiles = [...knownVoid([{ x: 100, y: 100 }]), candidate, enemyTile];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan).toBeUndefined();
  });

  it("still credits a neutral (unowned) prize the same distance away", () => {
    const candidate = tile({ x: 100, y: 100, ownershipState: "SETTLED" });
    const neutralPrize = tile({ x: 103, y: 100, ownerId: undefined, ownershipState: undefined, resource: "IRON" });
    const tiles = [...knownVoid([{ x: 100, y: 100 }]), candidate, neutralPrize];

    const plan = chooseBestRelayBeaconBuild(
      { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 },
      tiles,
      lookupOf(tiles),
      [candidate]
    );

    expect(plan?.tile.x).toBe(100);
    expect(plan?.siteValue).toBe(8);
  });
});
