import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { relayBeaconManpowerCost } from "@border-empires/shared";

// docs/replenishment-update-plan.md D12: a player's first 5 owned Relay
// Beacons are placed instantly (no timer wait) but still charge their
// discounted manpower; the 6th takes the full hour.
const buildRuntime = () =>
  new SimulationRuntime({
    now: () => Date.now(),
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
      techIds: new Set<string>(), domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(),
      strategicResources: { FOOD: 100, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    }]]),
    initialState: {
      tiles: [
        ...Array.from({ length: 6 }, (_, i) => ({
          x: 10 + i, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const
        })),
        // FOOD slot supply for the 6th beacon, which (unlike the first 5) isn't waived.
        { x: 20, y: 20, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "FARM" as const }
      ],
      activeLocks: []
    },
  });

const buildBeacon = async (runtime: SimulationRuntime, i: number): Promise<void> => {
  runtime.submitCommand({
    commandId: `beacon-${i}`, sessionId: "session-1", playerId: "player-1", clientSeq: i + 1, issuedAt: Date.now(),
    type: "BUILD_STRUCTURE" as any,
    payloadJson: JSON.stringify({ x: 10 + i, y: 10, structureType: "RELAY_BEACON" }),
  });
  await Promise.resolve();
};

const beaconStatus = (runtime: SimulationRuntime, i: number): string | undefined => {
  const json = runtime.exportState().tiles.find((t) => t.x === 10 + i && t.y === 10)?.economicStructureJson;
  return json ? (JSON.parse(json) as { status: string }).status : undefined;
};

describe("Relay Beacon instant first tier", () => {
  it("completes each of the first 5 beacons without advancing any time, and still charges manpower", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildRuntime();
      const events: string[] = [];
      runtime.onEvent((event) => { if (event.eventType === "COMMAND_REJECTED") events.push(event.code); });
      const before = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpower;
      for (let i = 0; i < 5; i++) {
        await buildBeacon(runtime, i);
        vi.advanceTimersByTime(0);
        await Promise.resolve();
        expect(beaconStatus(runtime, i)).toBe("active");
      }
      expect(events).toEqual([]);
      const after = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpower;
      expect(before - after).toBeGreaterThanOrEqual(5 * relayBeaconManpowerCost(0) - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes the 6th beacon wait out its hour", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildRuntime();
      for (let i = 0; i < 5; i++) {
        await buildBeacon(runtime, i);
        vi.advanceTimersByTime(0);
        await Promise.resolve();
      }
      await buildBeacon(runtime, 5);
      vi.advanceTimersByTime(3_599_000);
      await Promise.resolve();
      expect(beaconStatus(runtime, 5)).toBe("under_construction");
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      expect(beaconStatus(runtime, 5)).toBe("active");
    } finally {
      vi.useRealTimers();
    }
  });
});
