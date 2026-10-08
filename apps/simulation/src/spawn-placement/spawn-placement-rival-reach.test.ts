import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { chooseLegacySpawnPlacement, RALLY_SPAWN_RADIUS, SPAWN_RIVAL_REACH_CLEARANCE } from "./spawn-placement.js";

// Regression for "I spawned next to another player and their reach ate all of
// mine": reach is first-come, so an AFC whose disk lands on a rival's reach
// border is never auto-claimed. The crowded-map fallback passes (no distance
// check) and rally spawns (3 tiles from the inviter) used to pick such a spot
// whenever one came up. Every pass but the last now keeps the AFC's disk, plus
// one ring, out of other players' reach.
//
// World: 40x40 open land. The rival's reach border covers x < 20 (the rival
// itself owns no tiles here, as with reach left unclaimed after a restart),
// so a clear spawn needs x >= 20 + SPAWN_RIVAL_REACH_CLEARANCE.
const RIVAL_REACH_EDGE_X = 20;
const buildWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 40; x += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  return tiles;
};
const rivalReach = (x: number): string | undefined => (x < RIVAL_REACH_EDGE_X ? "rival" : undefined);
// Fail every distance pass, as on a crowded map: hasNearbySettled is true for any radius > 0.
const crowded = (_x: number, _y: number, radius: number): boolean => radius > 0;
const clearOfRival = (spawn: { x: number }) => spawn.x - SPAWN_RIVAL_REACH_CLEARANCE >= RIVAL_REACH_EDGE_X;

describe("chooseLegacySpawnPlacement and rival reach", () => {
  it("keeps the AFC disk out of a rival's reach when clear ground exists", () => {
    const tiles = buildWorld();
    for (let index = 0; index < 25; index += 1) {
      let relaxed = false;
      const spawn = chooseLegacySpawnPlacement({
        playerId: `player-${index}`,
        tiles,
        hasNearbySettled: crowded,
        reachOwnerAt: (x) => rivalReach(x),
        onRivalReachRelaxed: () => {
          relaxed = true;
        }
      });
      expect(spawn).toBeDefined();
      expect(clearOfRival(spawn!)).toBe(true);
      expect(relaxed).toBe(false);
    }
  });

  it("control: without the reach lookup the same search lands inside the rival's reach", () => {
    const tiles = buildWorld();
    const landedInside = Array.from({ length: 25 }, (_, index) =>
      chooseLegacySpawnPlacement({ playerId: `player-${index}`, tiles, hasNearbySettled: crowded })
    ).some((spawn) => spawn !== undefined && !clearOfRival(spawn));
    expect(landedInside).toBe(true);
  });

  it("ignores the spawning player's own reach", () => {
    const spawn = chooseLegacySpawnPlacement({
      playerId: "rival",
      tiles: buildWorld().filter((tile) => tile.x < RIVAL_REACH_EDGE_X),
      hasNearbySettled: crowded,
      reachOwnerAt: (x) => rivalReach(x),
      onRivalReachRelaxed: () => {
        throw new Error("own reach must not count as a rival's");
      }
    });
    expect(spawn).toBeDefined();
  });

  it("still spawns, and reports the map as nearly full, when no ground is clear of rival reach", () => {
    let relaxed = false;
    const spawn = chooseLegacySpawnPlacement({
      playerId: "player-x",
      tiles: buildWorld(),
      hasNearbySettled: crowded,
      reachOwnerAt: () => "rival",
      onRivalReachRelaxed: () => {
        relaxed = true;
      }
    });
    expect(spawn).toBeDefined();
    expect(relaxed).toBe(true);
  });

  it("keeps a rally spawn out of the inviter's reach too", () => {
    const rallyAnchor = { x: RIVAL_REACH_EDGE_X - 2, y: 20 };
    for (let index = 0; index < 10; index += 1) {
      const spawn = chooseLegacySpawnPlacement({
        playerId: `friend-${index}`,
        tiles: buildWorld(),
        rallyAnchor,
        reachOwnerAt: (x) => rivalReach(x)
      });
      expect(spawn).toBeDefined();
      expect(clearOfRival(spawn!)).toBe(true);
      expect(Math.max(Math.abs(spawn!.x - rallyAnchor.x), Math.abs(spawn!.y - rallyAnchor.y))).toBeLessThanOrEqual(RALLY_SPAWN_RADIUS);
    }
  });
});
