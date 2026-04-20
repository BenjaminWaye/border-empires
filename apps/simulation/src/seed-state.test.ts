import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { createSeedPlayers, createSeedWorld, parseSimulationSeedProfile, simulationWorldSeedForProfile } from "./seed-state.js";

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
    expect(world.tiles.get("25,1")).toMatchObject({ ownerId: "barbarian-1", ownershipState: "FRONTIER" });
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
    expect(world.tiles.get("25,1")).toMatchObject({ ownerId: "barbarian-1", ownershipState: "FRONTIER" });
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
      if (tile.ownerId && tile.ownershipState === "SETTLED") {
        ownedHomeTiles.push({ playerId: tile.ownerId, x: tile.x, y: tile.y });
      }
    }

    expect(world.summary.profile).toBe("season-20ai");
    expect(world.summary.aiPlayers).toBe(20);
    expect(world.summary.totalTiles).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(world.summary.totalSettledTiles).toBe(21);
    expect(world.summary.totalTownTiles).toBe(21);
    expect(simulationWorldSeedForProfile("season-20ai")).toBe(20_260);
    expect(world.summary.perPlayer.filter((player) => player.isAi)).toHaveLength(20);
    expect(world.summary.perPlayer.every((player) => player.settledTiles === 1 && player.towns === 1)).toBe(true);
    expect(world.players.has("barbarian-1")).toBe(true);
    expect(terrainCounts.LAND).toBeGreaterThan(0);
    expect(terrainCounts.SEA).toBeGreaterThan(0);
    expect(terrainCounts.MOUNTAIN).toBeGreaterThan(0);
    expect(neutralTownCount).toBeGreaterThan(70);
    expect(dockCount).toBeGreaterThan(0);
    expect(shardSiteCount).toBeGreaterThan(0);
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

  it("builds the season-20ai player set without requiring world generation", () => {
    const players = createSeedPlayers("season-20ai");

    expect(players.has("player-1")).toBe(true);
    expect(players.has("barbarian-1")).toBe(true);
    expect(players.has("ai-1")).toBe(true);
    expect(players.has("ai-20")).toBe(true);
    expect(players.size).toBe(22);
  });
});
