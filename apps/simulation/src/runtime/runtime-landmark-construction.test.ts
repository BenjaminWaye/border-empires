import { createRelicState } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "./runtime.test-helpers.js";

const land = (x: number, y: number) => ({
  x, y, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const
});

describe("landmark construction footprints", () => {
  it("rejects forts on AFCs and relics and on their diagonal neighbors, but allows one just outside", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", {
          points: 5_000, manpower: 10_000, techIds: new Set(["masonry"])
        })]]),
        initialState: {
          tiles: [
            { ...afcModuleFixtureTile("player-1"), x: 10, y: 10 },
            land(11, 11),
            land(12, 11),
            { ...land(16, 16), naturalWonder: createRelicState("WARPRESS") },
            land(15, 15),
            { ...land(20, 20), resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });
      const events = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "queued-fort", sessionId: "session-1", playerId: "player-1", clientSeq: 1,
        issuedAt: 1_000, type: "DEV_QUEUE_ENQUEUE",
        payloadJson: JSON.stringify({ x: 11, y: 11, tileKey: "11,11", kind: "BUILD", structureType: "FORT" })
      });
      await Promise.resolve();
      expect(events).toContainEqual(expect.objectContaining({
        eventType: "COMMAND_REJECTED", commandId: "queued-fort", code: "BUILD_INVALID"
      }));
      const cases = [[10, 10, "AFC"], [11, 11, "AFC"], [16, 16, "relic"], [15, 15, "relic"], [12, 11, undefined]] as const;
      for (const [i, [x, y, landmark]] of cases.entries()) {
        const commandId = `fort-${i}`;
        runtime.submitCommand({
          commandId, sessionId: "session-1", playerId: "player-1", clientSeq: i + 2,
          issuedAt: 1_000, type: "BUILD_FORT", payloadJson: JSON.stringify({ x, y })
        });
        await Promise.resolve();
        const rejection = events.find(event => event.eventType === "COMMAND_REJECTED" && event.commandId === commandId);
        if (landmark) expect(rejection).toMatchObject({ code: "BUILD_INVALID", message: expect.stringContaining(`${landmark} footprint`) });
        else expect(rejection).toBeUndefined();
      }
      expect(runtime.exportState().tiles.filter(tile => tile.fortJson).map(tile => [tile.x, tile.y])).toEqual([[12, 11]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a reserved plot when auto-placing a town building", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", {
          points: 5_000, manpower: 10_000, techIds: new Set(["trade", "agriculture"])
        })]]),
        initialState: {
          tiles: [
            afcModuleFixtureTile("player-1"),
            { ...land(16, 16), town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" } },
            { ...land(14, 16), naturalWonder: createRelicState("WARPRESS") },
            land(15, 16),
            land(17, 16),
            ...[18, 19, 20, 21].map(y => ({ ...land(16, y), resource: "FARM" }))
          ],
          activeLocks: []
        }
      });
      runtime.submitCommand({
        commandId: "manufactory", sessionId: "session-1", playerId: "player-1", clientSeq: 1,
        issuedAt: 1_000, type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MANUFACTORY" })
      });
      await Promise.resolve();
      expect(runtime.exportState().tiles.filter(tile => tile.economicStructureJson).map(tile => [tile.x, tile.y])).toEqual([[17, 16]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
