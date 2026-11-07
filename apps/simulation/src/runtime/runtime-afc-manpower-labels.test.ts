import { describe, expect, it } from "vitest";
import { MANPOWER_REGEN_GLOBAL_FLOOR, STARTING_CAPITAL_MANPOWER_CAP } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

describe("AFC-backed construction and manpower", () => {
it("does not grant town manpower boosts while a claimed town tile is still frontier", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            town: { name: "Claimed", type: "MARKET", populationTier: "TOWN", goldPerMinute: 2 }
          }
        ],
        activeLocks: []
      }
    });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");

    expect(player?.manpowerCap).toBe(0);
    expect(player?.manpowerRegenPerMinute).toBe(MANPOWER_REGEN_GLOBAL_FLOOR);
    expect(player?.manpowerBreakdown).toEqual({
      cap: [],
      regen: []
    });
    expect(player?.ownedTownTileKeys).toEqual([]);
    expect(player?.townCount).toBe(0);
  });

it("uses explicit plural labels for high-tier manpower breakdown groups", async () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: 6_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "GREAT_CITY", goldPerMinute: 1 }
          },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "GREAT_CITY", goldPerMinute: 1 }
          },
          {
            x: 12,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "METROPOLIS", goldPerMinute: 1 }
          },
          {
            x: 13,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "METROPOLIS", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    const payload = { manpowerBreakdown: player!.manpowerBreakdown! };
    // No biota is developed, so all four large towns also show the shortfall line.
    expect(payload.manpowerBreakdown.cap.map((line) => line.label)).toEqual(["2 Great Cities", "2 Metropolises", "Unruly towns, short of biota (4)"]);
    expect(payload.manpowerBreakdown.regen.map((line) => line.label)).toEqual(["2 Great Cities", "2 Metropolises", "Unruly towns, short of biota (4)"]);
  });
});
