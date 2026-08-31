import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, buildAiOpponent, collectEvents } from "./runtime.test-helpers.js";

// The client's Activity Feed / email-alert copy for a purge victim ("we have
// been the target of an Aether Purge... lost control of tile") depends on the
// runtime addressing an AETHER_PURGE_ALERT PLAYER_MESSAGE to the defender —
// see client-network.ts and gateway-app.ts's ATTACK_ALERT-style handling.
describe("Aether Purge alerts the defender", () => {
  it("emits an AETHER_PURGE_ALERT player message addressed to the defender", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildAiOpponent({ manpower: 100 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ] as never,
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "aether-purge-alert",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    const alert = events.find(
      (event): event is Extract<typeof event, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "AETHER_PURGE_ALERT"
    );
    expect(alert?.playerId).toBe("player-2");
    const payload = JSON.parse(alert?.payloadJson ?? "{}") as { type: string; x: number; y: number; attackerId: string };
    expect(payload).toMatchObject({ type: "AETHER_PURGE_ALERT", x: 5, y: 0, attackerId: "player-1" });
  });
});
