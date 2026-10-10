import { describe, expect, it, vi } from "vitest";

const generation = vi.hoisted(() => ({ calls: 0 }));

// Real season-20ai worldgen takes seconds to minutes; a tiny stand-in keeps
// this about caching and sharing, not terrain.
vi.mock("../season-seed-world.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../season-seed-world.js")>();
  return {
    ...actual,
    createSeasonSeedWorld: (seed: number, createPlayer: Parameters<typeof actual.createSeasonSeedWorld>[1]) => {
      generation.calls += 1;
      return {
        players: new Map([
          ["player-1", createPlayer("player-1", false)],
          ["ai-1", createPlayer("ai-1", true)]
        ]),
        tiles: new Map([["1,1", { x: 1, y: 1, terrain: "LAND" as const }]]),
        docks: [],
        worldSeed: seed,
        significantIslandCount: 1,
        humanPlayers: 1,
        aiPlayers: 1,
        totalTiles: 1,
        totalSettledTiles: 0,
        totalTownTiles: 0,
        perPlayer: [{ playerId: "ai-1", isAi: true, settledTiles: 0, towns: 0 }]
      };
    }
  };
});

import { createSeedWorld, readSeedWorldTemplate } from "./seed-state.js";

describe("readSeedWorldTemplate", () => {
  it("generates the season-20ai world once and shares it, while createSeedWorld still returns private copies", () => {
    const template = readSeedWorldTemplate("season-20ai");
    expect(readSeedWorldTemplate("season-20ai")).toBe(template);
    expect(generation.calls).toBe(1);

    const copy = createSeedWorld("season-20ai");
    expect(generation.calls).toBe(1);
    expect(copy.players).not.toBe(template.players);
    copy.players.get("player-1")!.points = 12_345;
    copy.tiles.delete("1,1");
    expect(template.players.get("player-1")!.points).not.toBe(12_345);
    expect(template.tiles.has("1,1")).toBe(true);
    expect(template.summary.profile).toBe("season-20ai");
  });

  it("caches the small profiles too", () => {
    expect(readSeedWorldTemplate("default")).toBe(readSeedWorldTemplate("default"));
    expect(readSeedWorldTemplate("default").summary.profile).toBe("default");
  });
});
