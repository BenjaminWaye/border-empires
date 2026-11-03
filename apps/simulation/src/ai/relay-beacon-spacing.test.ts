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
const buildStrip = (beaconStatus: "active" | "inactive" | "removing" = "active", inactiveReason?: string) => {
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
        ...(isBeacon ? { economicStructure: { ownerId: player.id, type: "RELAY_BEACON" as const, status: beaconStatus, ...(inactiveReason ? { inactiveReason } : {}) } } : {})
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

  it("counts each candidate the spacing rule turns away", () => {
    const { tiles, owned } = buildStrip();
    const skips = { spacing: 0 };
    chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 1), siteAt(tiles, EXISTING.x + 2)], undefined, skips);
    expect(skips.spacing).toBe(2);
  });

  it("still allows the next beacon one reach radius away, so beacons can chain", () => {
    const { tiles, owned } = buildStrip();
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + OUTPOST_REACH_RADIUS)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + OUTPOST_REACH_RADIUS, y: 100 });
  });

  it("keeps the spacing around a beacon switched off for FOOD relief, which can be re-enabled", () => {
    const { tiles, owned } = buildStrip("inactive", "manual");
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan).toBeUndefined();
  });

  it("ignores a beacon disabled for another reason, which the AI never re-enables", () => {
    const { tiles, owned } = buildStrip("inactive", "upkeep");
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + 2, y: 100 });
  });

  it("ignores a beacon being demolished", () => {
    const { tiles, owned } = buildStrip("removing");
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + 2, y: 100 });
  });

  it("ignores a FOOD-relief beacon on a FRONTIER tile, which can never be re-enabled", () => {
    const { tiles, owned } = buildStrip("inactive", "manual");
    tiles.get(`${EXISTING.x},${EXISTING.y}`)!.ownershipState = "FRONTIER";
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + 2, y: 100 });
  });

  it("exempts a site that brings a prize into reach, however close", () => {
    const { tiles, owned } = buildStrip();
    // One tile past the existing beacon's box, inside the +2 site's box.
    tiles.set("106,104", { x: 106, y: 104, terrain: "LAND", resource: "FISH" });
    const plan = chooseBestRelayBeaconBuild(player, owned, tiles, [siteAt(tiles, EXISTING.x + 2)]);
    expect(plan?.tile).toMatchObject({ x: EXISTING.x + 2, y: 100 });
  });

  it("keeps ringing beacons from filling the strip", () => {
    const { tiles, owned } = buildStrip();
    const built: number[] = [EXISTING.x];
    for (let step = 0; step < 30; step += 1) {
      const plan = chooseBestRelayBeaconBuild(player, owned, tiles, owned);
      if (!plan) break;
      built.push(plan.tile.x);
      plan.tile.economicStructure = { ownerId: player.id, type: "RELAY_BEACON", status: "active" };
    }
    // 26 tiles wide: one beacon per reach radius covers it.
    expect(built.length).toBeLessThanOrEqual(Math.ceil(26 / OUTPOST_REACH_RADIUS) + 1);
  });
});
