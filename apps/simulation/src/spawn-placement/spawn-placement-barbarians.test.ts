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

// Strict legacy passes keep 50 tiles clear of every SETTLED tile -- barbarian
// land included -- so avoidance only matters once minSpawnDistance relaxes
// (a crowded map). Simulate that by failing the 50/20 distance passes.
describe("chooseLegacySpawnPlacement barbarian avoidance in relaxed passes", () => {
  const relaxedOnly = (radius: number): boolean => radius >= 20;

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
      hasNearbySettled: (_x, _y, radius) => relaxedOnly(radius),
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
