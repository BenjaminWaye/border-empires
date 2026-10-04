import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { BARBARIAN_SPAWN_AVOID_RADIUS, hasBarbarianWithin } from "./barbarian-proximity.js";
import { chooseLegacySpawnPlacement } from "./spawn-placement.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const barb = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" });

describe("hasBarbarianWithin", () => {
  const tiles = new Map<string, DomainTileState>([
    [simulationTileKey(10, 10), barb(10, 10)],
    [simulationTileKey(30, 30), { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
  ]);

  it("finds a barbarian tile inside the radius and not outside it", () => {
    expect(hasBarbarianWithin(tiles, 13, 12, 3)).toBe(true);
    expect(hasBarbarianWithin(tiles, 14, 10, 3)).toBe(false);
  });

  it("ignores other players' tiles", () => {
    expect(hasBarbarianWithin(tiles, 30, 31, 5)).toBe(false);
  });
});

// Barbarian tiles are SETTLED, so they already count toward minSpawnDistance:
// every pass with a distance >= BARBARIAN_SPAWN_AVOID_RADIUS keeps clear of
// them with no extra hook. Pinned here with the real (unstubbed) distance check.
describe("chooseLegacySpawnPlacement and barbarian land", () => {
  const buildWorld = (): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) tiles.push(x < 20 ? barb(x, y) : { x, y, terrain: "LAND" });
    }
    return tiles;
  };

  it("keeps the 10-tile minimum distance from barbarian-held land when the wider passes cannot be met", () => {
    const tiles = buildWorld(); // 50/20-tile clearance impossible on a 40-wide world; the 10-tile pass decides
    for (let index = 0; index < 25; index += 1) {
      const spawn = chooseLegacySpawnPlacement({ playerId: `player-${index}`, tiles });
      expect(spawn).toBeDefined();
      expect(spawn!.x).toBeGreaterThanOrEqual(30);
    }
  });
});

// Only a pass that drops the distance check entirely (the crowded-map
// fallback) needs the barbarian hook. Simulate a crowded map by failing every
// distance pass: hasNearbySettled is true for any radius > 0.
describe("chooseLegacySpawnPlacement barbarian avoidance on the 0-distance fallback", () => {
  const crowded = (_x: number, _y: number, radius: number): boolean => radius > 0;

  const buildWorld = (openFromX: number): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) tiles.push(x < 20 ? barb(x, y) : { x, y, terrain: "LAND" });
    }
    return tiles.filter((tile) => tile.ownerId || tile.x >= openFromX);
  };

  const spawnFor = (playerId: string, tiles: DomainTileState[], withAvoidance: boolean) => {
    const byKey = new Map(tiles.map((tile) => [simulationTileKey(tile.x, tile.y), tile]));
    return chooseLegacySpawnPlacement({
      playerId,
      tiles,
      hasNearbySettled: crowded,
      ...(withAvoidance ? { hasNearbyBarbarian: (x: number, y: number, radius: number) => hasBarbarianWithin(byKey, x, y, radius) } : {})
    });
  };

  it("never lands within the avoid radius of barbarians when clear ground exists", () => {
    const tiles = buildWorld(20);
    for (let index = 0; index < 25; index += 1) {
      const spawn = spawnFor(`player-${index}`, tiles, true);
      expect(spawn).toBeDefined();
      expect(spawn!.x).toBeGreaterThan(19 + BARBARIAN_SPAWN_AVOID_RADIUS);
    }
  });

  it("control: without the hook the same search does land beside the barbarians", () => {
    const tiles = buildWorld(20);
    const landedBeside = Array.from({ length: 25 }, (_, index) => spawnFor(`player-${index}`, tiles, false)).some(
      (spawn) => spawn !== undefined && spawn.x <= 19 + BARBARIAN_SPAWN_AVOID_RADIUS
    );
    expect(landedBeside).toBe(true);
  });

  it("still spawns when every open tile is next to barbarians (best effort, never fails a spawn)", () => {
    const tiles = buildWorld(20).filter((tile) => tile.ownerId || tile.x < 20 + BARBARIAN_SPAWN_AVOID_RADIUS - 1);
    const spawn = spawnFor("player-x", tiles, true);
    expect(spawn).toBeDefined();
  });
});
