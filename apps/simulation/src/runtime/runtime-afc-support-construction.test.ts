import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, afcModuleFixtureTile } from "./runtime.test-helpers.js";

describe("AFC-backed construction and manpower", () => {
it("rejects duplicate support structures submitted directly on another support tile", async () => {
    // MANUFACTORY moved to same-tile/uncapped placement in the tech-tree redesign
    // (per-town cap removed), so it no longer exercises the town_support
    // one-per-town rule this test covers -- CENSUS_HALL is still
    // town_support and needs no tech, so it stands in as the exemplar here.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(), strategicResources: {} })
        ]
      ]),
      initialState: {
        tiles: [afcModuleFixtureTile("player-1"),
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
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "CENSUS_HALL", status: "active" }
          },
          {
            x: 17,
            y: 16,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      }
    });
    const events: Array<{ code: string; message: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
    });

    runtime.submitCommand({
      commandId: "census-hall-duplicate-support-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 17, y: 16, structureType: "CENSUS_HALL" })
    });

    await Promise.resolve();
    expect(events).toEqual([{ code: "BUILD_INVALID", message: "town already has census hall" }]);
    const duplicateTarget = runtime.exportState().tiles.find((tile) => tile.x === 17 && tile.y === 16);
    expect(duplicateTarget?.economicStructureJson).toBeUndefined();
  });

it("builds a ancillary depot with organized-supply tech and sufficient resources", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["organized-supply"]), strategicResources: { CRYSTAL: 200 } })
          ]
        ]),
        initialState: {
          tiles: [afcModuleFixtureTile("player-1"),
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            // §5.3: the town draws 4 FOOD slots, ANCILLARY_DEPOT draws 1 more.
            { x: 11, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 13, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
            // Ancillary Factory (same-tile, uncapped per town) — targets this
            // support tile directly, adjacent to the town but not on it.
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "ancillary-depot-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 9, y: 10, structureType: "ANCILLARY_DEPOT" })
      });

      await Promise.resolve();
      expect(events).toHaveLength(0);

      vi.advanceTimersByTime(structureBuildDurationMs("ANCILLARY_DEPOT"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 9 && tile.y === 10);
      expect(exported?.economicStructureJson).toContain("\"type\":\"ANCILLARY_DEPOT\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

it("rejects ancillary depot build when player lacks organized-supply", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, strategicResources: { CRYSTAL: 200 } })]
      ]),
      initialState: {
        tiles: [afcModuleFixtureTile("player-1"),
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
          }
        ],
        activeLocks: []
      }
    });

    const events: Array<{ code: string; message: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
    });

    runtime.submitCommand({
      commandId: "ancillary-depot-no-tech-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "ANCILLARY_DEPOT" })
    });

    await Promise.resolve();
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("BUILD_INVALID");
    expect(events[0].message).toBe("unlock ancillary depot first");
  });
});
