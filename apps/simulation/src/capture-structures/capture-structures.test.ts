import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

type SimulationRuntimeEventShape = SimulationEvent;

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

describe("capture structure survival", () => {
  it("transfers captured structures to the winner but removes siege outposts", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 9,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { type: "MARKET", name: "Attacker Town", populationTier: "TOWN" }
            },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-2", status: "active" },
              observatory: { ownerId: "player-2", status: "active", cooldownUntil: 5_000 },
              siegeOutpost: { ownerId: "player-2", status: "active" },
              economicStructure: {
                ownerId: "player-2",
                type: "MARKET",
                status: "active",
                disabledUntil: 6_000
              }
            }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationRuntimeEventShape[] = [];
      runtime.onEvent((event) => {
        seen.push(event);
      });

      runtime.submitCommand({
        commandId: "capture-structures-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile).toEqual(
        expect.objectContaining({
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          fortJson: JSON.stringify({ ownerId: "player-1", status: "active" }),
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", cooldownUntil: 5_000 }),
          economicStructureJson: JSON.stringify({
            ownerId: "player-1",
            type: "MARKET",
            status: "active",
            disabledUntil: 6_000
          })
        })
      );
      expect(capturedTile?.siegeOutpostJson).toBeUndefined();

      const captureDelta = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "TILE_DELTA_BATCH" }> =>
          event.eventType === "TILE_DELTA_BATCH" && event.commandId === "capture-structures-1"
      );
      expect(captureDelta?.tileDeltas).toContainEqual(
        expect.objectContaining({
          x: 10,
          y: 11,
          fortJson: JSON.stringify({ ownerId: "player-1", status: "active" }),
          observatoryJson: JSON.stringify({ ownerId: "player-1", status: "active", cooldownUntil: 5_000 })
        })
      );
      expect(captureDelta?.tileDeltas.find((tile) => tile.x === 10 && tile.y === 11)?.siegeOutpostJson).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("destroys captured structures that are still under construction", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              observatory: { ownerId: "player-2", status: "under_construction", completesAt: 10_000 },
              economicStructure: { ownerId: "player-2", type: "WOODEN_FORT", status: "under_construction", completesAt: 10_000 }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-under-construction-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" }));
      expect(capturedTile?.observatoryJson).toBeUndefined();
      expect(capturedTile?.economicStructureJson).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("transfers active wooden forts on capture", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              economicStructure: { ownerId: "player-2", type: "WOODEN_FORT", status: "active" }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-wooden-fort-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile?.economicStructureJson).toBe(JSON.stringify({ ownerId: "player-1", type: "WOODEN_FORT", status: "active" }));
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the wooden fort when a fort upgrade is captured mid-build", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-2", status: "under_construction", completesAt: 10_000 },
              economicStructure: { ownerId: "player-2", type: "WOODEN_FORT", status: "active" }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-fort-upgrade-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" }));
      expect(capturedTile?.fortJson).toBeUndefined();
      expect(capturedTile?.economicStructureJson).toBe(JSON.stringify({ ownerId: "player-1", type: "WOODEN_FORT", status: "active" }));
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("cancels removal timers for captured structures that survive", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              observatory: { ownerId: "player-2", status: "removing", previousStatus: "inactive", completesAt: 10_000 }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-removing-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile?.observatoryJson).toBe(JSON.stringify({ ownerId: "player-1", status: "inactive" }));
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
