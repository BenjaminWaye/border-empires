import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * Manual Garrison (SETTLE) must accept every out-of-reach tile the sim
 * garrisons on its own: towns/docks (reach anchors) and captured buildings.
 * Plain land far from any anchor stays OUT_OF_REACH.
 */
const settleAt = async (extraTile: Record<string, unknown>): Promise<SimulationEvent[]> => {
  const scheduledTasks: Array<() => void> = [];
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", ...extraTile }
      ],
      docks: [],
      activeLocks: []
    }
  });
  const seen = collectEvents(runtime);
  runtime.submitCommand({
    commandId: "cmd-settle",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "SETTLE",
    payloadJson: JSON.stringify({ x: 50, y: 50 })
  });
  await Promise.resolve();
  while (scheduledTasks.length > 0) scheduledTasks.shift()?.();
  await Promise.resolve();
  return seen;
};

const rejection = (seen: SimulationEvent[]): string | undefined =>
  seen.find((event) => event.eventType === "COMMAND_REJECTED")?.code as string | undefined;

describe("manual Garrison on out-of-reach frontier tiles", () => {
  it("still rejects plain land outside reach", async () => {
    expect(rejection(await settleAt({}))).toBe("OUT_OF_REACH");
  });

  it("accepts a captured fort tile outside reach", async () => {
    const seen = await settleAt({ fort: { ownerId: "player-1", status: "active" } });
    expect(rejection(seen)).toBeUndefined();
    expect(seen.some((event) => event.eventType === "SETTLEMENT_STARTED")).toBe(true);
  });

  it("accepts a captured economic structure tile outside reach", async () => {
    const seen = await settleAt({ economicStructure: { ownerId: "player-1", type: "FARMSTEAD", status: "active" } });
    expect(rejection(seen)).toBeUndefined();
    expect(seen.some((event) => event.eventType === "SETTLEMENT_STARTED")).toBe(true);
  });
});
