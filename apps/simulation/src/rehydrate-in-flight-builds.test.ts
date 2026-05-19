import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const tileAt = (runtime: SimulationRuntime, x: number, y: number) =>
  runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y);

describe("in-flight structure-build rehydration on sim startup", () => {
  it("flips an under_construction fort to active when completesAt is already in the past", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 5,
              y: 5,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "under_construction", completesAt: 50_000 }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);

      expect(tileAt(runtime, 5, 5)?.fortJson).toBe(
        JSON.stringify({ ownerId: "player-1", status: "active" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("flips an under_construction observatory to active after the remaining wait elapses", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 6,
              y: 6,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              observatory: { ownerId: "player-1", status: "under_construction", completesAt: 105_000 }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(4_999);
      expect(tileAt(runtime, 6, 6)?.observatoryJson).toBe(
        JSON.stringify({ ownerId: "player-1", status: "under_construction", completesAt: 105_000 })
      );

      vi.advanceTimersByTime(1);
      expect(tileAt(runtime, 6, 6)?.observatoryJson).toBe(
        JSON.stringify({ ownerId: "player-1", status: "active" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes an under_construction siege outpost", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 7,
              y: 7,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              siegeOutpost: { ownerId: "player-1", status: "under_construction", completesAt: 50_000 }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);
      expect(tileAt(runtime, 7, 7)?.siegeOutpostJson).toBe(
        JSON.stringify({ ownerId: "player-1", status: "active" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes an under_construction economic structure preserving its type", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 8,
              y: 8,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              economicStructure: {
                ownerId: "player-1",
                type: "MARKET",
                status: "under_construction",
                completesAt: 50_000
              }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);
      expect(tileAt(runtime, 8, 8)?.economicStructureJson).toBe(
        JSON.stringify({ ownerId: "player-1", type: "MARKET", status: "active" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes a removing structure (clearing it) so development slots free up", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 9,
              y: 9,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: {
                ownerId: "player-1",
                status: "removing",
                previousStatus: "active",
                completesAt: 50_000
              }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);
      expect(tileAt(runtime, 9, 9)?.fortJson).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("frees development slots so settle is no longer rejected after three stuck builds resolve", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 100_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 1,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "under_construction", completesAt: 50_000 }
            },
            {
              x: 2,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              observatory: { ownerId: "player-1", status: "under_construction", completesAt: 50_000 }
            },
            {
              x: 3,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              economicStructure: {
                ownerId: "player-1",
                type: "MARKET",
                status: "under_construction",
                completesAt: 50_000
              }
            }
          ],
          activeLocks: []
        }
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);

      const rejectedEvents: string[] = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED" && event.commandId === "settle-1") {
          rejectedEvents.push(event.message ?? event.code);
        }
      });

      runtime.submitCommand({
        commandId: "settle-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 100_001,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 0, y: 0 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(1);

      expect(rejectedEvents).not.toContain("development slots are busy");
    } finally {
      vi.useRealTimers();
    }
  });
});
