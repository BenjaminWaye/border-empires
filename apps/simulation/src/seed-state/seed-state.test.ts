import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { createSeedPlayers, createSeedWorld, parseSimulationSeedProfile, simulationWorldSeedForProfile } from "./seed-state.js";
import type { SimulationSeedWorld } from "./seed-state.js";

const countSignificantIslands = (world: SimulationSeedWorld, minTiles: number): number => {
  const seen = new Set<string>();
  const key = (x: number, y: number): string => `${x},${y}`;
  let significantIslands = 0;

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startKey = key(x, y);
      if (seen.has(startKey)) continue;
      if (world.tiles.get(startKey)?.terrain !== "LAND") continue;

      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      seen.add(startKey);
      let size = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index]!;
        size += 1;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = (current.x + dx + WORLD_WIDTH) % WORLD_WIDTH;
            const ny = (current.y + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
            const nextKey = key(nx, ny);
            if (seen.has(nextKey)) continue;
            if (world.tiles.get(nextKey)?.terrain !== "LAND") continue;
            seen.add(nextKey);
            queue.push({ x: nx, y: ny });
          }
        }
      }
      if (size >= minTiles) significantIslands += 1;
    }
  }

  return significantIslands;
};

describe("simulation seed state", () => {
  it("falls back to the default profile for unknown env values", () => {
    expect(parseSimulationSeedProfile(undefined)).toBe("default");
    expect(parseSimulationSeedProfile("unknown")).toBe("default");
    expect(parseSimulationSeedProfile("season-20ai")).toBe("season-20ai");
    expect(simulationWorldSeedForProfile("default")).toBe(42);
  });

  it("builds the stress seed profile with 10 AI empires at 200 settled tiles and 10 towns each", () => {
    const world = createSeedWorld("stress-10ai");

    expect(world.summary.profile).toBe("stress-10ai");
    expect(world.summary.aiPlayers).toBe(10);
    expect(world.summary.perPlayer.filter((player) => player.isAi)).toHaveLength(10);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.settledTiles === 200)).toBe(true);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.towns === 10)).toBe(true);
    expect(world.summary.totalTownTiles).toBe(103);
    expect(world.tiles.get("2,4")).toMatchObject({ ownerId: "player-1", town: { name: "Nauticus", type: "FARMING" } });
    expect(world.tiles.get("4,4")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(world.tiles.get("5,4")).toMatchObject({ ownerId: "ai-1", ownershipState: "SETTLED" });
    expect(world.tiles.get("25,1")).toMatchObject({ ownerId: "barbarian-1", ownershipState: "SETTLED" });
    expect(world.tiles.get("9,12")).toMatchObject({ terrain: "SEA" });
  });

  it("builds the 20-ai stress seed profile with the expected scale", () => {
    const world = createSeedWorld("stress-20ai");

    expect(world.summary.profile).toBe("stress-20ai");
    expect(world.summary.aiPlayers).toBe(20);
    expect(world.summary.perPlayer.filter((player) => player.isAi)).toHaveLength(20);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.settledTiles === 200)).toBe(true);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.towns === 10)).toBe(true);
    expect(world.summary.totalSettledTiles).toBe(4_050);
    expect(world.summary.totalTownTiles).toBe(203);
    expect(simulationWorldSeedForProfile("stress-20ai")).toBe(2_020);
    expect(world.tiles.get("4,4")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(world.tiles.get("5,4")).toMatchObject({ ownerId: "ai-1", ownershipState: "SETTLED" });
    expect(world.tiles.get("5,28")).toMatchObject({ ownerId: "ai-11", ownershipState: "SETTLED" });
    expect(world.tiles.get("101,42")).toMatchObject({ ownerId: "ai-20", ownershipState: "SETTLED" });
  });

  it("builds the 40-ai stress seed profile with the expected scale", () => {
    const world = createSeedWorld("stress-40ai");

    expect(world.summary.profile).toBe("stress-40ai");
    expect(world.summary.aiPlayers).toBe(40);
    expect(world.summary.perPlayer.filter((player) => player.isAi)).toHaveLength(40);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.settledTiles === 200)).toBe(true);
    expect(world.summary.perPlayer.filter((player) => player.isAi).every((player) => player.towns === 10)).toBe(true);
    expect(world.summary.totalSettledTiles).toBe(8_050);
    expect(world.summary.totalTownTiles).toBe(403);
    expect(world.tiles.get("4,4")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(world.tiles.get("5,4")).toMatchObject({ ownerId: "ai-1", ownershipState: "SETTLED" });
    expect(world.tiles.get("25,1")).toMatchObject({ ownerId: "barbarian-1", ownershipState: "SETTLED" });
    expect(world.tiles.get("101,98")).toMatchObject({ ownerId: "ai-40", ownershipState: "SETTLED" });
  });

  it("builds the season-20ai profile on a full worldgen map with 20 AI settlements", () => {
    const world = createSeedWorld("season-20ai");
    const terrainCounts = { LAND: 0, SEA: 0, MOUNTAIN: 0 };
    const ownedHomeTiles: Array<{ playerId: string; x: number; y: number }> = [];
    let neutralTownCount = 0;
    let dockCount = 0;
    let shardSiteCount = 0;

    for (const tile of world.tiles.values()) {
      terrainCounts[tile.terrain] += 1;
      if (tile.dockId) dockCount += 1;
      if (tile.shardSite) shardSiteCount += 1;
      if (tile.town && !tile.ownerId) neutralTownCount += 1;
      if (tile.ownerId && tile.ownerId !== "barbarian-1" && tile.ownershipState === "SETTLED") {
        ownedHomeTiles.push({ playerId: tile.ownerId, x: tile.x, y: tile.y });
      }
    }

    expect(world.summary.profile).toBe("season-20ai");
    expect(world.summary.aiPlayers).toBe(20);
    expect(world.summary.totalTiles).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(world.summary.totalSettledTiles).toBe(21);
    expect(world.summary.totalTownTiles).toBe(21);
    expect(simulationWorldSeedForProfile("season-20ai")).toBe(22);
    // This profile always generates in "continents" style (createSeedWorld never
    // passes a style option) at the fixed seed above, so this count is fully
    // deterministic. The 20-30 band predates the quincunx 5-continent layout
    // (worldgen.ts) and no longer matches its coastline fragmentation — actual
    // is a stable 38 for this seed. Banded rather than pinned to stay resilient
    // to minor unrelated worldgen tuning.
    expect(countSignificantIslands(world, 20)).toBeGreaterThanOrEqual(25);
    expect(countSignificantIslands(world, 20)).toBeLessThanOrEqual(45);
    expect(world.summary.perPlayer.filter((player) => player.isAi)).toHaveLength(20);
    expect(world.summary.perPlayer.every((player) => player.settledTiles === 1 && player.towns === 1)).toBe(true);
    expect(world.players.has("barbarian-1")).toBe(true);
    expect(terrainCounts.LAND).toBeGreaterThan(0);
    expect(terrainCounts.SEA).toBeGreaterThan(0);
    expect(terrainCounts.MOUNTAIN).toBeGreaterThan(0);
    expect(neutralTownCount).toBeGreaterThan(70);
    expect(dockCount).toBeGreaterThan(0);
    // PR #859 removed initial shard-cache scattering from world creation —
    // shard sites now only appear later via the periodic shard-rain tick
    // (runtime-shard-rain-tick.ts), never at genesis. Asserting 0 here (was
    // previously toBeGreaterThan(0) and silently broken since #859) so a
    // regression that reintroduces initial scattering is caught.
    expect(shardSiteCount).toBe(0);
    expect(ownedHomeTiles).toHaveLength(21);
    for (let index = 0; index < ownedHomeTiles.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < ownedHomeTiles.length; otherIndex += 1) {
        const left = ownedHomeTiles[index]!;
        const right = ownedHomeTiles[otherIndex]!;
        const dx = Math.abs(left.x - right.x);
        const dy = Math.abs(left.y - right.y);
        const wrappedDx = Math.min(dx, WORLD_WIDTH - dx);
        const wrappedDy = Math.min(dy, WORLD_HEIGHT - dy);
        expect(Math.max(wrappedDx, wrappedDy)).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it("caches the season-20ai worldgen but deep-clones each returned world", () => {
    const first = createSeedWorld("season-20ai");
    const second = createSeedWorld("season-20ai");

    expect(second.tiles).not.toBe(first.tiles);
    expect(second.players).not.toBe(first.players);
    expect(second.tiles.size).toBe(first.tiles.size);

    const [sampleKey, firstTile] = [...first.tiles.entries()][0]!;
    expect(second.tiles.get(sampleKey)).toEqual(firstTile);
    // The nested tile object must be a distinct instance, not a shared ref.
    expect(second.tiles.get(sampleKey)).not.toBe(firstTile);

    const firstPlayer = first.players.get("player-1")!;
    const secondPlayer = second.players.get("player-1")!;
    expect(secondPlayer).not.toBe(firstPlayer);
    // Set-typed fields must survive structuredClone as real Sets.
    expect(secondPlayer.techIds).toBeInstanceOf(Set);

    // Mutating one caller's copy — including nested object/Set fields the sim
    // runtime constructor writes in place (manpower regen, tile ownership
    // merge) — must never leak into the cached template or another caller's
    // copy. A shared reference here would let one login/runtime corrupt the
    // world view of every subsequent one.
    secondPlayer.manpower = -999;
    secondPlayer.techIds.add("LEAKED_TECH");
    second.tiles.get(sampleKey)!.ownerId = "leaked-owner";
    second.tiles.delete(sampleKey);

    expect(first.players.get("player-1")!.manpower).not.toBe(-999);
    expect(first.players.get("player-1")!.techIds.has("LEAKED_TECH")).toBe(false);
    expect(first.tiles.has(sampleKey)).toBe(true);
    expect(first.tiles.get(sampleKey)!.ownerId).not.toBe("leaked-owner");
    // A third fresh call is likewise unaffected by the second's mutations.
    expect(createSeedWorld("season-20ai").tiles.has(sampleKey)).toBe(true);
  });

  it("builds the season-20ai player set without requiring world generation", () => {
    const players = createSeedPlayers("season-20ai");

    expect(players.has("player-1")).toBe(true);
    expect(players.has("barbarian-1")).toBe(true);
    expect(players.has("ai-1")).toBe(true);
    expect(players.has("ai-20")).toBe(true);
    expect(players.size).toBe(22);
  });
});
