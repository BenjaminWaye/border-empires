import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer } from "../runtime/runtime.test-helpers.js";

describe("Manufactory construction", () => {
  it("builds a manufactory through the rewrite simulation path directly on a support tile", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["trade"]), strategicResources: {} })
          ]
        ]),
        initialState: {
          tiles: [
            afcModuleFixtureTile("player-1"),
            {
              x: 16,
              y: 16,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
            },
            {
              x: 16,
              y: 17,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED"
            },
            // §5.3: the town draws 2 FOOD slots, MANUFACTORY draws 1 more — supply
            // it or the build rejects with INSUFFICIENT_SLOT.
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
        commandId: "manufactory-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 17, structureType: "MANUFACTORY" })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 16,
          y: 17,
          economicStructureJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("MANUFACTORY"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      expect(exported?.economicStructureJson).toContain("\"type\":\"MANUFACTORY\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("redirects a Manufactory/Ancillary Depot/Weapons Factory targeted at the town tile itself onto an open support tile — only a Fort belongs directly on a town", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["trade"]), strategicResources: {} })
          ]
        ]),
        initialState: {
          tiles: [
            afcModuleFixtureTile("player-1"),
            {
              x: 30,
              y: 30,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Redirect Town", type: "MARKET", populationTier: "TOWN" }
            },
            { x: 30, y: 31, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 30, y: 32, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 33, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 34, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 35, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 36, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "manufactory-on-town-tile",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        // Targeting the town tile itself (30,30), not a support tile.
        payloadJson: JSON.stringify({ x: 30, y: 30, structureType: "MANUFACTORY" })
      });

      await Promise.resolve();
      // The town tile itself must stay clear...
      const townTile = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 30);
      expect(townTile?.economicStructureJson).toBeUndefined();
      // ...and the build landed on the open support tile instead.
      const supportTile = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 31);
      expect(supportTile?.economicStructureJson).toEqual(expect.stringContaining("\"type\":\"MANUFACTORY\""));
    } finally {
      vi.useRealTimers();
    }
  });

});
