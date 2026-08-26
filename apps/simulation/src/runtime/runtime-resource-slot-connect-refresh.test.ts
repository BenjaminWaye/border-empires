import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression coverage for refreshResourceSlotCachesForPlayer (wired into
// per-connect-hellos.ts): resource-slot supply/demand/dormancy are cached per
// player and only invalidated by that player's own tile changes (see
// runtime-tile-index-maintenance.ts). If that cache ever ends up wrong with
// no tile change to bust it, nothing short of a real tile mutation could fix
// it for the player -- this proves a forced-fresh refresh on connect
// self-heals it without one.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("SimulationRuntime — resource-slot cache self-heals on connect", () => {
  it("refreshResourceSlotCachesForPlayer corrects a stuck-wrong cached FOOD supply", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 5, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "FISH" as const },
          { x: 6, y: 6, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "FISH" as const }
        ],
        activeLocks: []
      }
    });
    await Promise.resolve();

    // Populate the cache with the correct value first (2 FISH tiles x 2 slots each).
    const runtimeInternals = runtime as unknown as {
      resourceSlotSupplyForPlayer: (playerId: string) => { FOOD: number };
      resourceSlotSupplyCacheByPlayer: Map<string, { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number }>;
      refreshResourceSlotCachesForPlayer: (playerId: string) => void;
    };
    expect(runtimeInternals.resourceSlotSupplyForPlayer("player-1").FOOD).toBe(4);

    // Simulate the class of bug this guards against: the cache holding a
    // wrong value with no tile change of the player's own to invalidate it.
    runtimeInternals.resourceSlotSupplyCacheByPlayer.set("player-1", { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(runtimeInternals.resourceSlotSupplyForPlayer("player-1").FOOD).toBe(0);

    runtimeInternals.refreshResourceSlotCachesForPlayer("player-1");

    expect(runtimeInternals.resourceSlotSupplyForPlayer("player-1").FOOD).toBe(4);
  });

  it("does nothing for a player id the runtime doesn't recognize", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    expect(() => runtime.refreshResourceSlotCachesForPlayer("nonexistent-player")).not.toThrow();
  });
});
