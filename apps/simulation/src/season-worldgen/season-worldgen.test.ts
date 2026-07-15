import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { generateSeasonWorld } from "./season-worldgen.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";

const countSignificantIslands = (tiles: RecoveredSimulationState["tiles"], minTiles: number): number => {
  const tileByKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const seen = new Set<string>();
  let significantIslands = 0;

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startKey = `${x},${y}`;
      if (seen.has(startKey)) continue;
      if (tileByKey.get(startKey)?.terrain !== "LAND") continue;

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
            const nextKey = `${nx},${ny}`;
            if (seen.has(nextKey)) continue;
            if (tileByKey.get(nextKey)?.terrain !== "LAND") continue;
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

describe("season worldgen", () => {
  it("builds a 20-ai seasonal world without pre-seeded human empires", async () => {
    const generated = await generateSeasonWorld("seasonal-default", 12345, { mapStyle: "islands" });

    const towns = generated.initialState.tiles.filter((tile) => tile.town);
    const aiOwnedTiles = generated.initialState.tiles.filter((tile) => tile.ownerId?.startsWith("ai-"));
    const humanOwnedTiles = generated.initialState.tiles.filter((tile) => tile.ownerId?.startsWith("player-"));
    const aiPlayers = generated.initialState.players.filter((player) => player.id.startsWith("ai-"));
    const aiNames = aiPlayers.map((player) => player.name);

    expect(generated.worldSeed).toBeGreaterThan(0);
    expect(generated.initialState.tiles.length).toBeGreaterThan(20_000);
    expect(towns.length).toBeGreaterThan(50);
    expect(aiPlayers).toHaveLength(20);
    expect(aiOwnedTiles.length).toBeGreaterThanOrEqual(20);
    expect(humanOwnedTiles).toHaveLength(0);
    expect(aiNames).toContain("Freja Sund");
    expect(aiNames).toContain("Bryn Holt");
    expect(aiNames.every((name) => typeof name === "string" && !name.startsWith("ai-"))).toBe(true);
    // buildIslands() scatters 55 island blobs by construction (worldgen.ts); some
    // fragment into multiple disconnected landmasses from the coastline wobble,
    // some merge or fall below the 20-tile significance floor. Sampled across
    // several seeds the real generator lands consistently in the 40-65 range —
    // nothing like the old 20-30 band, which was reverse-engineered for the
    // pre-fix continents-based fake-islands approximation.
    expect(countSignificantIslands(generated.initialState.tiles, 20)).toBeGreaterThanOrEqual(30);
    expect(countSignificantIslands(generated.initialState.tiles, 20)).toBeLessThanOrEqual(80);
    expect(generated.initialState.docks?.length ?? 0).toBeGreaterThan(10);
    expect(generated.initialState.players).toContainEqual(
      expect.objectContaining({
        id: "barbarian-1",
        name: "Barbarians"
      })
    );

    const barbarianTiles = generated.initialState.tiles.filter((tile) => tile.ownerId === "barbarian-1");
    // Seed target lowered to 20 (from 80) so barbarians start small; growth is
    // separately capped in the planner (MAX_BARBARIAN_TILES). Placement can
    // fall a little short of target when land is scarce, so assert a band.
    expect(barbarianTiles.length).toBeGreaterThanOrEqual(10);
    expect(barbarianTiles.length).toBeLessThanOrEqual(20);
    expect(barbarianTiles.every((tile) => tile.ownershipState === "SETTLED")).toBe(true);
    expect(barbarianTiles.every((tile) => tile.terrain === "LAND")).toBe(true);
    expect(barbarianTiles.every((tile) => !tile.town && !tile.dockId)).toBe(true);
  });
});
