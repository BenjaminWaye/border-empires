import { describe, expect, it } from "vitest";

import { generateSeasonWorld } from "./season-worldgen.js";

describe("season worldgen", () => {
  it("builds a 10-ai seasonal world without pre-seeded human empires", () => {
    const generated = generateSeasonWorld("seasonal-default", 12345);

    const towns = generated.initialState.tiles.filter((tile) => tile.town);
    const aiOwnedTiles = generated.initialState.tiles.filter((tile) => tile.ownerId?.startsWith("ai-"));
    const humanOwnedTiles = generated.initialState.tiles.filter((tile) => tile.ownerId?.startsWith("player-"));
    const aiPlayers = generated.initialState.players.filter((player) => player.id.startsWith("ai-"));
    const aiNames = aiPlayers.map((player) => player.name);

    expect(generated.worldSeed).toBeGreaterThan(0);
    expect(generated.initialState.tiles.length).toBeGreaterThan(20_000);
    expect(towns.length).toBeGreaterThan(50);
    expect(aiPlayers).toHaveLength(10);
    expect(aiOwnedTiles.length).toBeGreaterThanOrEqual(10);
    expect(humanOwnedTiles).toHaveLength(0);
    expect(aiNames).toContain("Freja Sund");
    expect(aiNames).toContain("Rowan Hale");
    expect(aiNames.every((name) => typeof name === "string" && !name.startsWith("ai-"))).toBe(true);
    expect(generated.initialState.docks?.length ?? 0).toBeGreaterThan(10);
    expect(generated.initialState.players).toContainEqual(
      expect.objectContaining({
        id: "barbarian-1",
        name: "Barbarians"
      })
    );
  });
});
