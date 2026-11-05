/**
 * Regression: season-13 prod AIs (ai-9 680 reach / 1,396 owned, ai-5
 * 1,282 / 2,902, ai-19 1,985 / 2,938) sat on WAIT with
 * `BLOCKED_NO_REACHABLE_BEACON_SITE` and plenty of manpower. Each owns a
 * wide band of FRONTIER outside its reach. EXPAND/SETTLE are reach-gated in
 * the planner, so the only way across is a beacon — but beacon coverage only
 * credited *unowned* land, and a band deeper than OUTPOST_REACH_RADIUS leaves
 * every legal site (SETTLED, or FRONTIER inside reach) covering nothing but
 * the AI's own out-of-reach frontier. No site, no beacon, stuck forever.
 */
import { describe, expect, it } from "vitest";
import { OUTPOST_REACH_RADIUS, tileKeysInReach } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";
import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";
import type { StructurePlannerTile } from "./structure-command-planner.js";

const player = { id: "ai-1", points: 0, manpower: 500, settledTileCount: 1, townCount: 1 };
const TOWN = { x: 100, y: 100 };
// Owned frontier runs this far east of the town; neutral land lies beyond it.
const BAND_EAST_EDGE = 115;

const buildBandedEmpire = (neutralBeyondBand = true) => {
  const tiles = new Map<string, StructurePlannerTile>();
  // Big enough that every in-reach site's scan box is fully known (no fog).
  for (let y = 88; y <= 112; y += 1) {
    for (let x = 88; x <= 130; x += 1) {
      const isTown = x === TOWN.x && y === TOWN.y;
      // Sea west of x=94; owned frontier from there to the band's east edge.
      const owned = x >= 94 && x <= BAND_EAST_EDGE;
      tiles.set(`${x},${y}`, {
        x,
        y,
        terrain: owned || (x > BAND_EAST_EDGE && neutralBeyondBand) ? "LAND" : "SEA",
        ...(owned ? { ownerId: player.id, ownershipState: isTown ? "SETTLED" : "FRONTIER" } : {}),
        ...(isTown ? { town: { populationTier: "TOWN" as const } } : {})
      });
    }
  }
  const reachKeys = new Set(tileKeysInReach({ ...TOWN, ownerId: player.id, activatedAt: 0, kind: "TOWN" }));
  const owned = [...tiles.values()].filter((tile) => tile.ownerId === player.id);
  return { tiles, owned, reachLookup: { isInReach: (_pid: string, x: number, y: number) => reachKeys.has(`${x},${y}`) }, reachKeys };
};

describe("relay beacon bridges an out-of-reach frontier band", () => {
  it("proposes an in-reach site that pushes reach into the band when no site reaches unowned land", () => {
    const { tiles, owned, reachLookup, reachKeys } = buildBandedEmpire();
    // Precondition: the band is deeper than one beacon radius, so no legal
    // site covers any unowned land.
    expect(BAND_EAST_EDGE - Math.max(...[...reachKeys].map((key) => Number(key.split(",")[0])))).toBeGreaterThan(OUTPOST_REACH_RADIUS);
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, owned, reachLookup);
    expect(plan).toBeDefined();
    expect(reachLookup.isInReach(player.id, plan!.tile.x, plan!.tile.y)).toBe(true);
    // It faces the deep band (east of the town), not the thin western strip.
    expect(plan!.tile.x).toBeGreaterThan(TOWN.x);
    // Low enough that a real prize always outranks a bridge, but above the
    // BUILD_BEACON site-value floor so the beacon actually fires.
    expect(plan!.siteValue).toBeGreaterThan(1);
    expect(plan!.siteValue).toBeLessThan(8);
  });

  it("prefers a site that reaches unowned land over a bridge", () => {
    const { tiles, owned, reachLookup } = buildBandedEmpire();
    // Free land just west of the town, within one beacon radius of an in-reach site.
    for (let y = 88; y <= 112; y += 1) {
      for (let x = 88; x <= 93; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
    }
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, owned, reachLookup);
    expect(plan?.tile.x).toBeLessThan(TOWN.x);
    expect(plan!.siteValue).toBeGreaterThanOrEqual(8);
  });

  it("does not bridge when all owned frontier is already inside reach", () => {
    const { tiles, reachKeys, reachLookup } = buildBandedEmpire(false);
    // Shrink the empire to the town's reach box; everything else is sea.
    for (const tile of tiles.values()) {
      if (!reachKeys.has(`${tile.x},${tile.y}`)) {
        tiles.set(`${tile.x},${tile.y}`, { x: tile.x, y: tile.y, terrain: "SEA" });
      }
    }
    const owned = [...tiles.values()].filter((tile) => tile.ownerId === player.id);
    expect(chooseBestRelayBeaconBuild(player, owned, tiles, owned, reachLookup)).toBeUndefined();
  });

  it("gets the full planner off BLOCKED_NO_REACHABLE_BEACON_SITE", () => {
    const { tiles, owned, reachLookup } = buildBandedEmpire();
    const result = planAutomationCommand({
      playerId: player.id,
      points: 500,
      manpower: 3_400,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: owned.filter((tile) => tile.ownershipState === "FRONTIER"),
      ownedTiles: owned,
      tilesByKey: tiles,
      reachLookup,
      settledTileCount: 1,
      townCount: 1,
      clientSeq: 7,
      issuedAt: 1_000,
      sessionPrefix: "ai-runtime"
    });
    expect(result.diagnostic.noCommandReason).not.toBe("BLOCKED_NO_REACHABLE_BEACON_SITE");
    // The bridge site is in-reach FRONTIER, so the first step settles it.
    expect(result.command?.type).toBe("SETTLE");
  });
});
