import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";

// Split out of runtime.test.ts (over the 500-line budget). These regression
// tests were briefly lost when the Shard removal deleted the shard-rain
// describe block they had been nested inside.
describe("SETTLEMENT capture evacuation", () => {
  const winningAttacker = (id: string) => ({
    id,
    isAi: false,
    points: 1_000,
    manpower: 10_000,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  });
  const weakDefender = (id: string) => ({
    id,
    isAi: true,
    points: 100,
    manpower: 1,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  });

  it("evacuates a captured SETTLEMENT onto the oldest remaining town-less tile of the previous owner", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", winningAttacker("player-1")],
          ["player-2", weakDefender("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }, // attacker settlement: supply-connects the attack origin (stranded origins decay) and anchors its own reach
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
            },
            { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
            {
              x: 30,
              y: 30,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Second Town", type: "FARMING", populationTier: "TOWN", population: 2_000 }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settlement-capture-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(captured?.ownerId).toBe("player-1");
      expect(captured?.ownershipState).toBe("FRONTIER");
      // SETTLEMENT town has been stripped off the captured tile.
      expect(captured).not.toHaveProperty("townJson");
      expect(captured?.townPopulationTier).toBeUndefined();

      // Town re-rooted on the previous owner's remaining settled tile, at the shocked population.
      const refuge = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
      expect(refuge?.ownerId).toBe("player-2");
      expect(refuge?.townPopulationTier).toBe("SETTLEMENT");
      const refugeTown = refuge?.townJson ? JSON.parse(refuge.townJson) as { population?: number } : undefined;
      const refugePop = refugeTown?.population ?? 0;
      expect(refugePop).toBeGreaterThan(0);
      expect(refugePop).toBeLessThan(800);
      const existingTown = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 30);
      expect(existingTown?.townPopulationTier).toBe("TOWN");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves the remaining city without granting an AFC when settlement relocation fails", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", winningAttacker("player-1")],
          ["player-2", { ...weakDefender("player-2"), points: 0 }]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }, // attacker settlement: supply-connects the attack origin (stranded origins decay) and anchors its own reach
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
            },
            // Remaining tile already has a CITY — must NOT be overwritten/downgraded.
            {
              x: 20,
              y: 20,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Capital", type: "FARMING", populationTier: "CITY", population: 5_000 }
            },
            { x: 22, y: 20, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settlement-capture-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      // Captured tile still loses its SETTLEMENT town (evacuation attempted).
      const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(captured?.ownerId).toBe("player-1");
      expect(captured).not.toHaveProperty("townJson");
      expect(captured?.townPopulationTier).toBeUndefined();

      // The pre-existing CITY is preserved — no silent downgrade to SETTLEMENT.
      const city = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
      expect(city?.townPopulationTier).toBe("CITY");
      const cityTown = city?.townJson ? JSON.parse(city.townJson) as { population?: number } : undefined;
      expect(cityTown?.population).toBe(5_000);

      const untouchedLand = runtime.exportState().tiles.find((tile) => tile.x === 22 && tile.y === 20);
      expect(untouchedLand?.ownerId).toBeUndefined();
      expect(untouchedLand?.afcJson).toBeUndefined();
      expect(runtime.exportState().tiles.some(tile => tile.ownerId === "player-2" && tile.afcJson)).toBe(false);
      expect(runtime.exportState().players.find(player => player.id === "player-2")?.points).toBe(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("re-roots onto owned frontier land when capture would otherwise leave the previous owner with no town income", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", winningAttacker("player-1")],
          ["player-2", weakDefender("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }, // attacker settlement: supply-connects the attack origin (stranded origins decay) and anchors its own reach
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
            },
            { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      runtime.submitCommand({
        commandId: "settlement-capture-frontier-refuge",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(captured?.ownerId).toBe("player-1");
      expect(captured).not.toHaveProperty("townJson");

      const refuge = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
      expect(refuge).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townPopulationTier: "SETTLEMENT"
        })
      );

      // player-2 is AI (#732 suppresses its PLAYER_UPDATE), so read the re-rooted
      // income from exportState rather than the now-suppressed message.
      const defenderIncome = runtime
        .exportState()
        .players.find((player) => player.id === "player-2")?.incomePerMinute;
      expect(defenderIncome).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
