import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

type SimulationRuntimeEventShape = SimulationEvent;

// Regression for the "immediate MP deduction on queue" gap (see AGENTS.md /
// the manpower-economy-rewrite-plan docs): EXPAND's manpower cost used to
// only get charged at lock resolution (up to ~90s later with forest/hills
// claim-time penalties), not when the command was accepted -- letting a
// player fire off far more simultaneous EXPANDs than their manpower could
// actually cover, since none of them showed as spent until each one
// individually resolved. See runtime-frontier-command.ts for the fix.
describe("EXPAND immediate manpower reservation", () => {
  const buildExpandRuntime = (scheduled: Array<{ delayMs: number; task: () => void }>) =>
    new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => { scheduled.push({ delayMs, task }); },
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 100, manpowerUpdatedAt: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 11, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

  const latestManpower = (seen: SimulationRuntimeEventShape[]): number =>
    (JSON.parse(
      seen.findLast(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
          event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
      )!.payloadJson
    ) as { manpower: number }).manpower;

  it("deducts EXPAND manpower immediately on accept, not at resolution", async () => {
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = buildExpandRuntime(scheduled);
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "expand-mp-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    expect(seen.map((e) => e.eventType)).toContain("COMMAND_ACCEPTED");
    expect(latestManpower(seen)).toBe(100 - EXPAND_MANPOWER_COST);

    // Resolving the lock must not charge the cost a second time.
    expect(scheduled).toHaveLength(1);
    scheduled[0]?.task();
    expect(latestManpower(seen)).toBe(100 - EXPAND_MANPOWER_COST);
  });

  it("refunds EXPAND manpower when the capture is cancelled before it resolves", async () => {
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = buildExpandRuntime(scheduled);
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "expand-mp-cancel-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();
    expect(scheduled).toHaveLength(1);

    runtime.submitCommand({
      commandId: "cancel-capture-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "CANCEL_CAPTURE",
      payloadJson: JSON.stringify({})
    });
    await Promise.resolve();

    expect(latestManpower(seen)).toBe(100);
  });
});
