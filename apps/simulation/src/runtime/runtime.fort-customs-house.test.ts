import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";

// Regression: Fort (and Wooden Fort) build was rejected with "tile already
// has structure" on a dock that has an active Harbor Exchange (CUSTOMS_HOUSE)
// economic structure, even though the same tile-sharing exemption already
// existed for RELAY_BEACON with no design reason to exclude CUSTOMS_HOUSE.
// See runtime-structure-command-handlers.ts's economicConflict check.

const makePlayer = (id: string, techIds: string[] = []) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 1_000,
  techIds: new Set<string>(techIds),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("SimulationRuntime Fort + Harbor Exchange (CUSTOMS_HOUSE) coexistence", () => {
  it("building a Fort on a dock tile with an active Harbor Exchange is accepted — they share the tile", async () => {
    vi.useFakeTimers();
    try {
      const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
      for (let x = 0; x <= 20; x += 1) {
        for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
      }
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", makePlayer("player-1", ["masonry"])]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            ...tiles,
            {
              x: 10,
              y: 10,
              terrain: "LAND" as const,
              ownerId: "player-1",
              ownershipState: "SETTLED" as const,
              dockId: "dock-10-10",
              economicStructure: { ownerId: "player-1", type: "CUSTOMS_HOUSE" as const, status: "active" as const }
            },
            // A free TITANIUM slot — FORT's resource-slot requirement.
            { x: 0, y: 0, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "TITANIUM" as const }
          ],
          activeLocks: []
        }
      });

      const rejections: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "build-fort-on-customs-house-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: Date.now(),
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
      await Promise.resolve();

      expect(rejections).toEqual([]);

      const tile = runtime
        .exportVisibleStateForPlayer("player-1")
        .tiles.find((t) => t.x === 10 && t.y === 10) as unknown as {
          fortJson?: string;
          economicStructureJson?: string;
        };
      const fort = tile?.fortJson ? JSON.parse(tile.fortJson) : undefined;
      const economicStructure = tile?.economicStructureJson ? JSON.parse(tile.economicStructureJson) : undefined;
      expect(fort?.ownerId).toBe("player-1");
      expect(fort?.status).toBe("active");
      // The Harbor Exchange is untouched — Fort and CUSTOMS_HOUSE share the tile.
      expect(economicStructure?.type).toBe("CUSTOMS_HOUSE");
      expect(economicStructure?.status).toBe("active");
    } finally {
      vi.useRealTimers();
    }
  });
});
