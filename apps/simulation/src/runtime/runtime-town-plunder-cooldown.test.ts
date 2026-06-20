import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

const makePlayer = (id: string, points: number) => ({
  id,
  isAi: false,
  points,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});

describe("town capture plunder cooldown", () => {
  it("does not plunder a town again while its capture shock is active", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      let nowMs = 1_000;
      const seen: SimulationEvent[] = [];
      const runtime = new SimulationRuntime({
        now: () => nowMs,
        seedTiles: new Map(),
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1", 1_000)],
          ["player-2", makePlayer("player-2", 500)]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              resource: "FARM",
              town: {
                name: "Backforth",
                type: "FARMING",
                populationTier: "TOWN",
                captureShockUntil: 2_000
              }
            }
          ],
          activeLocks: []
        }
      });
      runtime.onEvent((event) => seen.push(event));

      runtime.submitCommand({
        commandId: "recapture-town",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      nowMs = 5_000;
      vi.advanceTimersByTime(3_100);

      const resolved = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> =>
          event.eventType === "COMBAT_RESOLVED"
      );
      expect(resolved?.combatResult?.pillagedGold).toBe(0);
      expect(resolved?.combatResult?.pillagedShare).toBe(0);
      expect(resolved).not.toHaveProperty("pillagedGold");

      const state = runtime.exportState();
      const defender = state.players.find((player) => player.id === "player-2");
      const attacker = state.players.find((player) => player.id === "player-1");
      expect(defender?.points).toBe(500);
      expect(defender?.strategicResources?.FOOD).toBe(100);
      expect(attacker?.strategicResources?.FOOD).toBe(100);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
