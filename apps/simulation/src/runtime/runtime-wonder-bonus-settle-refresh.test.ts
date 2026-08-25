import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

type RawPlayerRef = { wonderDockGoldMultiplier?: number; wonderDockAttackMultiplier?: number };

// Regression: refreshPlayerWonders only counts SETTLED tiles (see
// runtime-natural-wonders.ts), but the call site in replaceTileState used to
// be gated purely on `!sameOwner` (an ownership change). The common claim
// flow — EXPAND a wonder tile to FRONTIER, then SETTLE it — never changes
// ownerId a second time, so the Deepwater Engine's dock-gold-doubling bonus
// (and any other wonder bonus) silently never turned on until some unrelated
// ownership-changing mutation happened to touch the tile again.
describe("wonder bonus fields refresh on settle completion", () => {
  it("applies the Deepwater Engine's dock gold multiplier once the claimed wonder tile finishes settling", async () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          },
          { x: 1, y: 0, terrain: "LAND", naturalWonder: { type: "DEEPWATER_ENGINE" } }
        ] as never,
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "expand-wonder",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
    await Promise.resolve();
    for (const task of scheduledTasks.splice(0)) task();

    // Right after claiming as frontier the tile isn't SETTLED yet, so
    // refreshPlayerWonders (which only counts SETTLED tiles) correctly
    // reports the bonus as not-yet-active.
    const rawAfterExpand = (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get("player-1")!;
    expect(rawAfterExpand.wonderDockGoldMultiplier).toBe(1);

    // Now settle it — same owner throughout, only ownershipState changes.
    runtime.submitCommand({
      commandId: "settle-wonder",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });
    await Promise.resolve();
    for (const task of scheduledTasks.splice(0)) task();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 1, y: 0, ownerId: "player-1", ownershipState: "SETTLED" })
    );
    const rawAfterSettle = (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get("player-1")!;
    expect(rawAfterSettle.wonderDockGoldMultiplier).toBe(2);
    expect(rawAfterSettle.wonderDockAttackMultiplier).toBe(1.15);
  });
});
