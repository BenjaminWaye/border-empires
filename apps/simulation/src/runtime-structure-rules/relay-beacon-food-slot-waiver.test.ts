import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { structureBuildDurationMs } from "@border-empires/shared";

// RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5): a player's first 5 Relay Beacons
// are waived down to 0 FOOD demand (slot-waivers.ts), but hasFreeResourceSlots
// (runtime-structure-command-handlers.ts) compares against the structure's
// full static FOOD requirement, which has no notion of "this specific build
// will be waived" on its own — regression coverage for a player with zero
// FOOD supply (no farms at all) still being able to build their free first 5.
describe("BUILD_STRUCTURE parity — RELAY_BEACON FOOD-slot waiver", () => {
  it("builds the first 5 Relay Beacons with zero FOOD supply anywhere in the empire, rejects the 6th", async () => {
    vi.useFakeTimers();
    try {
      const tiles = Array.from({ length: 6 }, (_, i) => ({
        x: 10 + i,
        y: 10,
        terrain: "LAND" as const,
        ownerId: "player-1",
        ownershipState: "SETTLED" as const
      }));
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", {
          id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
          techIds: new Set<string>(), domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local", allies: new Set<string>(),
          strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        }]]),
        initialState: { tiles, activeLocks: [] },
      });

      const rejections: Array<{ code: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
      });

      // Complete each build (advancing past RELAY_BEACON_BUILD_MS) before
      // starting the next, so DEVELOPMENT_PROCESS_LIMIT's concurrent-slot
      // cap never masks the FOOD-slot check this test actually targets.
      for (let i = 0; i < 6; i++) {
        runtime.submitCommand({
          commandId: `lo-${i}`, sessionId: "session-1", playerId: "player-1", clientSeq: i + 1, issuedAt: Date.now(),
          type: "BUILD_STRUCTURE" as any,
          payloadJson: JSON.stringify({ x: 10 + i, y: 10, structureType: "RELAY_BEACON" }),
        });
        await Promise.resolve();
        vi.advanceTimersByTime(structureBuildDurationMs("RELAY_BEACON"));
        await Promise.resolve();
      }

      expect(rejections).toEqual([{ code: "INSUFFICIENT_SLOT" }]);
      const state = runtime.exportState();
      for (let i = 0; i < 5; i++) {
        expect(state.tiles.find((t) => t.x === 10 + i && t.y === 10)?.economicStructureJson).toContain('"type":"RELAY_BEACON"');
      }
      expect(state.tiles.find((t) => t.x === 15 && t.y === 10)?.economicStructureJson).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression for a double-count found in review of the WOODEN_FORT-over-
  // RELAY_BEACON build carve-out: hasFreeResourceSlots credits back a
  // replaced tile's occupant via its raw, unwaived FOOD requirement. A
  // waived Relay Beacon (one of the player's free first 5, 0 counted FOOD
  // demand) must not hand back a phantom +1 FOOD credit that lets a
  // Palisade build bypass the gate with zero real free FOOD capacity.
  it("rejects a Palisade build on a waived Relay Beacon tile when the player has no other free FOOD slot", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", {
          id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
          techIds: new Set<string>(), domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local", allies: new Set<string>(),
          strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        }]]),
        initialState: {
          tiles: [
            {
              x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const,
              // First (and only) Relay Beacon owned -- fully within the free
              // first-5 waiver, so it counts 0 toward FOOD demand.
              economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const, activatedAt: 100 }
            }
          ],
          activeLocks: []
        },
      });

      const rejections: Array<{ code: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
      });

      runtime.submitCommand({
        commandId: "build-palisade-over-waived-beacon", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: Date.now(),
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "WOODEN_FORT" }),
      });
      await Promise.resolve();

      expect(rejections).toEqual([{ code: "INSUFFICIENT_SLOT" }]);
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.economicStructureJson).toContain('"type":"RELAY_BEACON"');
    } finally {
      vi.useRealTimers();
    }
  });
});
