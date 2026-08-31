import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("fort attack manpower loss (win/loss-independent, tier-scaled range)", () => {
  it("attacking a fort loses manpower from a fixed range tied to the fort's tier, the same whether the attack wins or loses", async () => {
    // Regression for the win-cheap/loss-expensive rebalance: manpower lost
    // attacking a SETTLED target used to scale with win/loss outcome (16%
    // of committed on a win, up to 125% on a loss) -- the same direction the
    // power gap already pushes win chance, compounding rather than
    // counterbalancing it. It's now a uniform random draw within the
    // target's fort-tier range (structure-costs.ts's
    // ATTACK_MANPOWER_LOSS_RANGE.FORT = 200-300), independent of outcome.
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

    const manpowerDeltaFor = async (randomValue: number): Promise<number | undefined> => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(randomValue);
      try {
        const runtime = buildRuntime();
        const seen = collectEvents(runtime);
        runtime.submitCommand({
          commandId: "fort-attack-1",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
        });
        await Promise.resolve();
        vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
        const combatResult = seen.find(
          (event): event is Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
        );
        return combatResult?.manpowerDelta;
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    };

    // randomValue=0 both wins the fight (0 < winChance) and draws the
    // range's min; randomValue=0.99 loses the fight (defended by a Fort's
    // 2.5x mult) but draws the SAME loss range -- the tier, not the
    // outcome, determines the loss.
    const lossOnWin = await manpowerDeltaFor(0);
    const lossOnLoss = await manpowerDeltaFor(0.99);
    expect(lossOnWin).toBeCloseTo(-200, 6);
    expect(lossOnLoss).toBeLessThanOrEqual(-200);
    expect(lossOnLoss).toBeGreaterThanOrEqual(-300);
  });
});
