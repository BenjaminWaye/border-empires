/**
 * Regression tests for §6.3 of docs/manpower-economy-rewrite-plan.md
 * (rush-buy), extended per user direction to also cover an
 * already-in-progress SETTLE/build: pay gold to finish it instantly,
 * priced by rushBuyPriceGold (time-proportional, anchored on the action's
 * manpower cost at 0.5 gold/manpower).
 */
import { describe, expect, it, vi } from "vitest";
import { SETTLE_MANPOWER_COST } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("RUSH_BUY", () => {
  it("finishes a pending SETTLE instantly and charges the time-proportional gold price", async () => {
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

      // Full rush from zero elapsed: SETTLE_MANPOWER_COST manpower * 0.5 gold/manpower.
      const goldBeforeRush = runtime.exportState().players.find((p) => p.id === "player-1")?.points ?? 0;

      runtime.submitCommand({
        commandId: "rush-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "RUSH_BUY",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.ownershipState).toBe("SETTLED");
      const player = runtime.exportState().players.find((p) => p.id === "player-1");
      expect(goldBeforeRush - (player?.points ?? 0)).toBe(Math.ceil(SETTLE_MANPOWER_COST * 0.5));
    } finally {
      vi.useRealTimers();
    }
  });

  it("prices a partially-elapsed SETTLE proportionally to the time remaining", async () => {
    vi.useFakeTimers();
    try {
      let nowMs = 1_000;
      const runtime = new SimulationRuntime({
        now: () => nowMs,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        }
      });
      runtime.submitCommand({
        commandId: "settle-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "SETTLE", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const pendingSettlement = runtime.exportState().pendingSettlements[0];
      // Advance halfway through the settle timer before rushing — both the
      // fake-timer clock (so the original scheduled completion doesn't fire
      // early) and the runtime's own `now()` (so remainingMs reflects it).
      const totalMs = pendingSettlement ? pendingSettlement.resolvesAt - pendingSettlement.startedAt : undefined;
      if (totalMs) {
        const halfway = Math.floor(totalMs / 2);
        vi.advanceTimersByTime(halfway);
        nowMs += halfway;
      }

      const goldBeforeRush = runtime.exportState().players.find((p) => p.id === "player-1")?.points ?? 0;
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const player = runtime.exportState().players.find((p) => p.id === "player-1");
      const spent = goldBeforeRush - (player?.points ?? 0);
      const fullPrice = Math.ceil(SETTLE_MANPOWER_COST * 0.5);
      expect(spent).toBeGreaterThan(0);
      expect(spent).toBeLessThan(fullPrice);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with INSUFFICIENT_GOLD when the player can't afford the rush price", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        // Enough gold (SETTLE_COST=4, unrelated nominal build price) to start
        // the settle, but not enough to also afford the rush price
        // (ceil(SETTLE_MANPOWER_COST * 0.5) = 10 gold).
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 5, manpower: 10_000 })]]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "settle-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "SETTLE", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rush-1");
      expect(rejected).toMatchObject({ code: "INSUFFICIENT_GOLD" });
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.ownershipState).toBe("FRONTIER");
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes an in-progress structure build instantly and completes it as active", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000, techIds: new Set(["trade"]) })]]),
        initialState: {
          tiles: [
            {
              x: 16, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
            },
            { x: 16, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 22, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "market-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MARKET" })
      });
      await Promise.resolve();

      const supportTile = runtime.exportState().tiles.find((t) => t.x === 16 && t.y === 17);
      expect(supportTile?.economicStructureJson).toContain('"status":"under_construction"');

      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 16, y: 17 })
      });
      await Promise.resolve();

      const finished = runtime.exportState().tiles.find((t) => t.x === 16 && t.y === 17);
      expect(finished?.economicStructureJson).toContain('"status":"active"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when there's nothing owned by this player to rush on the target tile", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();
      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rush-1");
      expect(rejected).toMatchObject({ code: "RUSH_BUY_INVALID" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a completed rush doesn't double-complete when the original timer later fires (idempotent)", async () => {
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
      runtime.submitCommand({
        commandId: "settle-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "SETTLE", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.ownershipState).toBe("SETTLED");

      // Let every remaining scheduled timer (including the original settle
      // completion) fire — must not throw, double-apply, or change state.
      vi.runAllTimers();
      const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.ownershipState).toBe("SETTLED");
    } finally {
      vi.useRealTimers();
    }
  });
});
