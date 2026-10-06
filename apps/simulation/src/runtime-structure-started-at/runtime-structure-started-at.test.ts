/**
 * docs/construction-animation-plan.md: under-construction structure records
 * carry `startedAt` beside `completesAt` so the client can compute exact
 * build progress (the true duration depends on manpower cost, tier upgrades,
 * build-speed effects and the relay-beacon discount, none of which the client
 * can reliably reconstruct). It must be gone once the structure completes.
 */
import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const BUILD_AT_MS = 1_000;

const buildRuntime = () => {
  let nowMs = BUILD_AT_MS;
  const runtime = new SimulationRuntime({
    now: () => nowMs,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 50_000, manpower: 10_000, techIds: new Set<string>(["trade", "agriculture"]), strategicResources: { FOOD: 100 } })]
    ]),
    initialState: {
      tiles: [
        { x: 16, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" } },
        { x: 16, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
      ],
      activeLocks: []
    }
  });
  runtime.exportPlayerDebugSnapshot();
  const events = collectEvents(runtime);
  return { runtime, events, advanceTo: (ms: number): void => { nowMs = ms; } };
};

type ExportedStructure = { status?: string; startedAt?: number; completesAt?: number };

// A town-attached build (target 16,16) is placed on the adjacent tile 16,17.
// Exported tiles carry structures as the same JSON string the wire does.
const structureAt = (runtime: SimulationRuntime): ExportedStructure | undefined => {
  const json = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17)?.economicStructureJson;
  return json ? (JSON.parse(json) as ExportedStructure) : undefined;
};

describe("structure startedAt stamping", () => {
  it("stamps startedAt at build start and strips it when the build completes", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, events, advanceTo } = buildRuntime();
      runtime.submitCommand({
        commandId: "started-at-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: BUILD_AT_MS,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MINTWORKS" })
      });
      await Promise.resolve();

      const rejection = events.find((event) => event.eventType === "COMMAND_REJECTED");
      expect(rejection, JSON.stringify(rejection)).toBeUndefined();
      const building = structureAt(runtime);
      expect(building?.status).toBe("under_construction");
      expect(building?.startedAt).toBe(BUILD_AT_MS);
      // The window the client divides by is the real build duration, not a flat constant.
      expect((building?.completesAt ?? 0) - (building?.startedAt ?? 0)).toBe(structureBuildDurationMs("MINTWORKS"));

      advanceTo((building?.completesAt ?? 0) + 1);
      await vi.advanceTimersByTimeAsync((building?.completesAt ?? 0) - BUILD_AT_MS + 1);

      const done = structureAt(runtime);
      expect(done?.status).toBe("active");
      expect(done).not.toHaveProperty("startedAt");
      expect(done).not.toHaveProperty("completesAt");
    } finally {
      vi.useRealTimers();
    }
  });
});
