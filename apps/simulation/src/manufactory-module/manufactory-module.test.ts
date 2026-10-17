import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const runtimeWithTooling = (installed: boolean): SimulationRuntime => {
  const afc = afcModuleFixtureTile("player-1");
  afc.afc.modules = installed ? ["trade"] : [];
  return new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", {
      points: 5_000, manpower: 1_000, techIds: new Set(["trade"])
    })]]),
    initialState: {
      tiles: [
        afc,
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Industry", type: "MARKET", populationTier: "TOWN" } },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ...Array.from({ length: 6 }, (_, i) => ({ x: 20 + i, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "FARM" as const }))
      ],
      activeLocks: []
    }
  });
};

describe("Manufactory tooling availability", () => {
  it.each([false, true])("requires installed tooling, not only a purchased unlock (installed=%s)", async (installed) => {
    const runtime = runtimeWithTooling(installed);
    const events = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "factory", sessionId: "session", playerId: "player-1", clientSeq: 1,
      issuedAt: 1_000, type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 11, y: 10, structureType: "MANUFACTORY" })
    });
    await Promise.resolve();
    const built = runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10)?.economicStructureJson;
    if (installed) {
      expect(built).toContain('"type":"MANUFACTORY"');
      expect(events.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    } else {
      expect(built).toBeUndefined();
      expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "BUILD_INVALID", message: expect.stringContaining("Industrial Tooling Module") }));
    }
  });
});
