/**
 * Regression: staging season-40 ai-18 (Oskar) ringed a 151-tile island with
 * ~25 active relay beacons about 2 tiles apart, where 2-3 cover it. The only
 * spacing check was against beacons still under construction, so the moment
 * one finished, a site 2 tiles along the border could win again on the few
 * fogged cells poking past the first beacon's reach box.
 */
import { describe, expect, it } from "vitest";
import { OUTPOST_REACH_RADIUS } from "@border-empires/shared";

import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";
import type { StructurePlannerTile } from "./structure-command-planner.js";

const player = { id: "ai-1", points: 0, manpower: 500, settledTileCount: 80, townCount: 1 };
const EXISTING = { x: 100, y: 100 };

// A settled strip owned by ai-1 with an active beacon at its middle. Only
// the strip is known; everything around it is fog, so any site whose box
// pokes past the existing beacon's reach scores fresh "unexplored" credit.
const buildStrip = (beaconStatus: "active" | "inactive" = "active") => {
  const tiles = new Map<string, StructurePlannerTile>();
  for (let y = 98; y <= 102; y += 1) {
    for (let x = 90; x <= 115; x += 1) {
      const isBeacon = x === EXISTING.x && y === EXISTING.y;
      tiles.set(`${x},${y}`, {
        x,
        y,
        terrain: "LAND",
        ownerId: player.id,
        ownershipState: "SETTLED",
        ...(isBeacon ? { economicStructure: { ownerId: player.id, type: "RELAY_BEACON" as const, status: beaconStatus } } : {})
      });
    }
  }
  return { tiles, owned: [...tiles.values()] };
};

const siteAt = (tiles: Map<string, StructurePlannerTile>, x: number): StructurePlannerTile => tiles.get(`${x},100`)!;

describe("relay beacon spacing", () => {
  it("does not build a second beacon right next to an active one", () => {
    const { tiles, owned } = buildStrip();
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan).toBeUndefined();
  });

  it("still allows the next beacon one reach radius away, so beacons can chain", () => {
    const { tiles, owned } = buildStrip();
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + OUTPOST_REACH_RADIUS)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + OUTPOST_REACH_RADIUS, y: 100 });
  });

  it("keeps the spacing around a disabled beacon, which can be re-enabled", () => {
    const { tiles, owned } = buildStrip("inactive");
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan).toBeUndefined();
  });

  it("picks the spaced-out site when both are candidates", () => {
    const { tiles, owned } = buildStrip();
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [
      siteAt(tiles, EXISTING.x + 2),
      siteAt(tiles, EXISTING.x + OUTPOST_REACH_RADIUS + 1)
    ]);
    expect(plan?.tile.x).toBe(EXISTING.x + OUTPOST_REACH_RADIUS + 1);
  });
});
