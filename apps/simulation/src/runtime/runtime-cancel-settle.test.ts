import { describe, expect, it, vi } from "vitest";
import { SETTLE_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("CANCEL_SETTLE", () => {
  it("cancels an active settlement and refunds the full gold and manpower spent", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500 })]]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 9,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            }
          ],
          activeLocks: []
        }
      });

      // Manpower is clamped to the player's cap at construction (see
      // refreshManpowerOnly), so read the actual starting value rather than
      // assuming the buildPlayer override survives untouched.
      const playerBeforeSettle = runtime.exportState().players.find((p) => p.id === "player-1");
      const manpowerBeforeSettle = playerBeforeSettle?.manpower ?? 0;

      // Start a settlement
      runtime.submitCommand({
        commandId: "settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const stateAfterSettle = runtime.exportState();
      const playerAfterSettle = stateAfterSettle.players.find((p) => p.id === "player-1");
      const tileAfterSettle = stateAfterSettle.tiles.find((t) => t.x === 10 && t.y === 10);

      // Tile should still be FRONTIER (not SETTLED) and there should be a pending settlement
      expect(tileAfterSettle?.ownershipState).toBe("FRONTIER");
      expect(stateAfterSettle.pendingSettlements.length).toBe(1);
      // Gold cost is nominal (SETTLE_COST is currently 0); manpower is the
      // real cost and should have been deducted for the settle.
      expect(playerAfterSettle?.points).toBe(500 - SETTLE_COST);
      expect(playerAfterSettle?.manpower).toBe(manpowerBeforeSettle - SETTLE_MANPOWER_COST);

      // Cancel the settlement
      runtime.submitCommand({
        commandId: "cancel-settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "CANCEL_SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const stateAfterCancel = runtime.exportState();
      const playerAfterCancel = stateAfterCancel.players.find((p) => p.id === "player-1");
      const tileAfterCancel = stateAfterCancel.tiles.find((t) => t.x === 10 && t.y === 10);

      // Tile should still be FRONTIER
      expect(tileAfterCancel?.ownershipState).toBe("FRONTIER");
      // Pending settlement should be gone
      expect(stateAfterCancel.pendingSettlements.length).toBe(0);
      // Gold and manpower should be fully refunded
      expect(playerAfterCancel?.points).toBe(500);
      expect(playerAfterCancel?.manpower).toBe(manpowerBeforeSettle);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects cancel when no settlement is in progress on the tile", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        }
      });

      const events = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "cancel-settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "CANCEL_SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const commandRejectEvent = events.find((e) => e.eventType === "COMMAND_REJECTED");
      expect(commandRejectEvent).toBeDefined();
      expect(commandRejectEvent?.code).toBe("SETTLE_CANCEL_INVALID");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects cancel when a different player owns the settlement", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })],
          ["player-2", buildPlayer("player-2", { points: 500, manpower: 10_000 })]
        ]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        }
      });

      // Player 1 starts a settlement
      runtime.submitCommand({
        commandId: "settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      // Player 2 tries to cancel it
      const events = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "cancel-settle-1",
        sessionId: "session-2",
        playerId: "player-2",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "CANCEL_SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const commandRejectEvent = events.find((e) => e.eventType === "COMMAND_REJECTED");
      expect(commandRejectEvent).toBeDefined();
      expect(commandRejectEvent?.code).toBe("SETTLE_CANCEL_INVALID");
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles the original scheduled resolve timer as a no-op after cancel", async () => {
    vi.useFakeTimers();
    try {
      let nowMs = 1_000;
      const runtime = new SimulationRuntime({
        now: () => nowMs,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 9,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            }
          ],
          activeLocks: []
        }
      });

      // Start a settlement
      runtime.submitCommand({
        commandId: "settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const pendingSettlement = runtime.exportState().pendingSettlements[0];
      expect(pendingSettlement).toBeDefined();

      // Cancel the settlement
      runtime.submitCommand({
        commandId: "cancel-settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "CANCEL_SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      // Advance time past when the settlement would have resolved
      const resolvesAt = pendingSettlement?.resolvesAt ?? 1_000;
      vi.advanceTimersByTime((resolvesAt - nowMs) + 1000);
      nowMs = resolvesAt + 1000;
      await Promise.resolve();

      // Tile should still be FRONTIER, not SETTLED
      const tileAfter = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tileAfter?.ownershipState).toBe("FRONTIER");
    } finally {
      vi.useRealTimers();
    }
  });
});
