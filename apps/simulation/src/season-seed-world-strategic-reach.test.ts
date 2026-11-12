import { describe, expect, it } from "vitest";
import { REFINERY_REACH_LAND_TILES, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { createSeasonSeedWorldAsync } from "./season-seed-world-async.js";

// Refinery-reach worldgen guarantee (docs/territory-development-plan.md,
// Phase 2 rule 9) checked on real generated worlds. Players are left out
// (0 human, 0 AI) so every town on the map is a worldgen town: season-start
// and live-join settlement towns are placed later and carry no guarantee.
const STRATEGIC = new Set(["TITANIUM", "UMBRITE", "GEMS"]);
const RING = 2;

// Strategic deposit tile counts for these seeds measured on the same
// 0-player generation immediately BEFORE the reach pass existed (worldgen v12,
// default 640x320 world). Re-placing a cluster can change its size (the tile
// count depends on the new spot's biome), so the totals may drift a little,
// but not by more than 10%.
const PRE_PASS_COUNTS: Record<number, Record<string, number>> = {
  12345: { TITANIUM: 270, UMBRITE: 217, GEMS: 151 },
  777: { TITANIUM: 238, UMBRITE: 270, GEMS: 152 }
};

const createPlayer = (id: string, isAi: boolean): DomainPlayer => ({
  id,
  isAi,
  points: 100,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-seasonal",
  allies: new Set<string>()
});

const generate = (seed: number): Promise<Map<string, DomainTileState>> =>
  createSeasonSeedWorldAsync(seed, createPlayer, { humanPlayerCount: 0, aiPlayerCount: 0 }).then((world) => {
    expect(world.worldSeed).toBe(seed); // the expectations above are for the requested seed itself
    return world.tiles;
  });

const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;

const strategicTileKeys = (tiles: Map<string, DomainTileState>): string[] =>
  [...tiles.values()].filter((tile) => tile.resource && STRATEGIC.has(tile.resource)).map((tile) => `${tile.x},${tile.y}:${tile.resource}`).sort();

const analyse = (tiles: Map<string, DomainTileState>) => {
  const towns = [...tiles.values()].filter((tile) => tile.town);
  const distance = new Int16Array(WORLD_WIDTH * WORLD_HEIGHT).fill(-1);
  const queue: number[] = [];
  for (const town of towns) {
    distance[town.y * WORLD_WIDTH + town.x] = 0;
    queue.push(town.y * WORLD_WIDTH + town.x);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!;
    const x = index % WORLD_WIDTH;
    const y = (index - x) / WORLD_WIDTH;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = wrapX(x + dx);
        const ny = wrapY(y + dy);
        const next = ny * WORLD_WIDTH + nx;
        if (distance[next] !== -1 || tiles.get(`${nx},${ny}`)?.terrain !== "LAND") continue;
        distance[next] = distance[index]! + 1;
        queue.push(next);
      }
    }
  }
  const nearTown = new Set<string>();
  for (const town of towns) {
    for (let dy = -RING; dy <= RING; dy += 1) {
      for (let dx = -RING; dx <= RING; dx += 1) nearTown.add(`${wrapX(town.x + dx)},${wrapY(town.y + dy)}`);
    }
  }

  const counts: Record<string, number> = { TITANIUM: 0, UMBRITE: 0, GEMS: 0 };
  const ringTiles: string[] = [];
  const unreachableFields: string[] = [];
  const seen = new Set<string>();
  let fields = 0;
  for (const tile of tiles.values()) {
    if (!tile.resource || !STRATEGIC.has(tile.resource)) continue;
    counts[tile.resource]! += 1;
    const tileKey = `${tile.x},${tile.y}`;
    if (nearTown.has(tileKey) || tile.dockId) ringTiles.push(tileKey);
    if (seen.has(tileKey)) continue;
    // 8-connected field of same-resource tiles.
    fields += 1;
    seen.add(tileKey);
    const stack = [tile];
    let inReach = false;
    while (stack.length > 0) {
      const current = stack.pop()!;
      const steps = distance[current.y * WORLD_WIDTH + current.x]!;
      if (steps >= 0 && steps <= REFINERY_REACH_LAND_TILES) inReach = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextKey = `${wrapX(current.x + dx)},${wrapY(current.y + dy)}`;
          const next = tiles.get(nextKey);
          if (!next || next.resource !== tile.resource || seen.has(nextKey)) continue;
          seen.add(nextKey);
          stack.push(next);
        }
      }
    }
    if (!inReach) unreachableFields.push(`${tile.resource}@${tileKey}`);
  }
  return { counts, ringTiles, unreachableFields, fields };
};

const expectGuarantee = (seed: number, tiles: Map<string, DomainTileState>): void => {
  const { counts, ringTiles, unreachableFields, fields } = analyse(tiles);
  expect(fields).toBeGreaterThan(100);
  expect(unreachableFields).toEqual([]);
  expect(ringTiles).toEqual([]);
  for (const [resource, before] of Object.entries(PRE_PASS_COUNTS[seed]!)) {
    expect(Math.abs(counts[resource]! - before) / before, `${resource} tile count vs ${before}`).toBeLessThanOrEqual(0.1);
  }
};

describe("worldgen strategic deposit reach guarantee", () => {
  it("puts every strategic field within reach of a town and clear of town rings (seed 777), deterministically", async () => {
    const first = await generate(777);
    expectGuarantee(777, first);
    const second = await generate(777);
    expect(strategicTileKeys(second)).toEqual(strategicTileKeys(first));
  }, 240_000);

  it("holds on a second seed (12345)", async () => {
    expectGuarantee(12345, await generate(12345));
  }, 240_000);
});
