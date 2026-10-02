import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// docs/replenishment-update-plan.md D6: end-to-end coverage for the
// commitment-choice ATTACK payload field, threaded through
// runtime-command-parsers.ts -> runtime-frontier-command.ts ->
// validateFrontierCommand (game-domain) -> resolveAttackCombat
// (runtime-combat-support.ts).
describe("ATTACK commitManpower (D6 commitment choice)", () => {
  const buildRuntime = () =>
    new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 1_000 })]
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
            // FORT's requiredMusterForFort floor is 300 -- plenty of headroom
            // above it to commit more.
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          {
            x: 10,
            y: 11,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-2", status: "active", variant: "FORT" as const }
          },
          // §5.4: FORT needs 1 TITANIUM slot to not go dormant.
          { x: 9, y: 11, terrain: "LAND", resource: "TITANIUM", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 21, y: 20, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

  const combatResultFor = async (commitManpower: number | undefined) => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const runtime = buildRuntime();
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "commit-attack-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({
          fromX: 10,
          fromY: 10,
          toX: 10,
          toY: 11,
          ...(commitManpower != null ? { commitManpower } : {})
        })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      const combatResult = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
      return combatResult;
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  };

  it("spends exactly the committed manpower (not the floor) when a higher commitment is requested", async () => {
    const result = await combatResultFor(600);
    expect(result?.manpowerDelta).toBeCloseTo(-600, 6);
  });

  it("raises win chance above the 1x baseline when committing more than the floor (FORT floor = 300)", async () => {
    const baseline = await combatResultFor(undefined); // defaults to the floor, 1x commitment
    const boosted = await combatResultFor(600); // 2x commitment -> 4x odds multiplier

    expect(baseline?.combatResult?.winChance).toBeDefined();
    expect(boosted?.combatResult?.winChance).toBeDefined();
    expect(boosted!.combatResult!.winChance).toBeCloseTo(Math.min(1, baseline!.combatResult!.winChance * 4), 6);
  });

  it("falls back to the floor (unchanged behavior) when no commitment is requested", async () => {
    const result = await combatResultFor(undefined);
    expect(result?.manpowerDelta).toBeCloseTo(-300, 6);
  });

  it("rejects the attack when the requested commitment exceeds the origin's available muster", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildRuntime();
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "commit-attack-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11, commitManpower: 5_000 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      const rejection = seen.find((event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> => event.eventType === "COMMAND_REJECTED");
      const combatResult = seen.find((event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED");
      expect(rejection?.code).toBe("INSUFFICIENT_MUSTER");
      expect(combatResult).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
