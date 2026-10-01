import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_MARCH_MAX_DISTANCE_TILES } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { makePlayer } from "./muster-march-test-support.js";

// Scenarios sit in an empty part of the map; the flag is at (BASE, BASE).
const BASE = 60;

const buildRuntime = (targets: Array<{ x: number; y: number }>) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
    initialState: {
      tiles: [
        { x: BASE, y: BASE, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ...targets.map(({ x, y }) => ({ x, y, terrain: "LAND" as const, ownershipState: "FRONTIER" as const }))
      ],
      activeLocks: []
    }
  });

const setMarch = async (runtime: SimulationRuntime, targetX: number, targetY: number): Promise<SimulationEvent[]> => {
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  runtime.submitCommand({
    commandId: `march-${targetX}-${targetY}`,
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "SET_MUSTER",
    payloadJson: JSON.stringify({ x: BASE, y: BASE, mode: "MARCH", targetX, targetY })
  });
  await Promise.resolve();
  return seen;
};

const rejection = (events: SimulationEvent[]) =>
  events.find((event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> => event.eventType === "COMMAND_REJECTED");

describe("march distance cap", () => {
  it("accepts a march exactly at the cap", async () => {
    const target = { x: BASE + MUSTER_MARCH_MAX_DISTANCE_TILES, y: BASE };
    const events = await setMarch(buildRuntime([target]), target.x, target.y);
    expect(rejection(events)).toBeUndefined();
    // ...and it really was processed (not just not-yet-seen).
    expect(events.some((event) => event.eventType === "COMMAND_RESOLVED")).toBe(true);
  });

  it("rejects a march over the cap with advice to raise a flag closer", async () => {
    const target = { x: BASE + MUSTER_MARCH_MAX_DISTANCE_TILES + 1, y: BASE };
    const rejected = rejection(await setMarch(buildRuntime([target]), target.x, target.y));
    expect(rejected?.code).toBe("MUSTER_MARCH_TOO_FAR");
    expect(rejected?.message).toContain("Raise a muster flag closer");
    expect(rejected?.message).toContain(`${MUSTER_MARCH_MAX_DISTANCE_TILES + 1} tiles`);
  });

  it("measures a diagonal by its larger axis, not the sum", async () => {
    const diagonalOk = { x: BASE + MUSTER_MARCH_MAX_DISTANCE_TILES, y: BASE + MUSTER_MARCH_MAX_DISTANCE_TILES };
    const events = await setMarch(buildRuntime([diagonalOk]), diagonalOk.x, diagonalOk.y);
    expect(rejection(events)).toBeUndefined();
    expect(events.some((event) => event.eventType === "COMMAND_RESOLVED")).toBe(true);
  });
});
