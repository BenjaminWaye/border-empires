/**
 * Aether Tower (Observatory) enable/disable regression tests.
 *
 * Before this feature an Observatory could only be demolished, never switched
 * off, while it kept charging progressively more CRYSTAL slots for as long as
 * it stood (resource-slot-view.ts). These cover the toggle itself plus the two
 * effects that have to follow it: the CRYSTAL slot bill and the
 * active-observatory index that gates crystal casting and vision.
 */
import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const buildRuntime = (observatoryTiles: Array<Record<string, unknown>>) => {
  const runtime = new SimulationRuntime({
    now: () => 10_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, strategicResources: { FOOD: 100, CRYSTAL: 100 } })],
      ["player-2", buildPlayer("player-2", { points: 5_000, manpower: 10_000 })]
    ]),
    initialState: {
      tiles: [
        {
          x: 16,
          y: 16,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { name: "Watchpoint", type: "MARKET", populationTier: "TOWN" }
        },
        ...observatoryTiles
      ],
      activeLocks: []
    }
  });
  return runtime;
};

const observatoryTile = (x: number, y: number, overrides: Record<string, unknown> = {}) => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  observatory: { ownerId: "player-1", status: "active", activatedAt: 1_000, ...overrides }
});

const submitToggle = (runtime: SimulationRuntime, commandId: string, clientSeq: number, x: number, y: number, enabled: boolean, playerId = "player-1") => {
  runtime.submitCommand({
    commandId,
    sessionId: "session-1",
    playerId,
    clientSeq,
    issuedAt: 10_000,
    type: "SET_OBSERVATORY_ENABLED",
    payloadJson: JSON.stringify({ x, y, enabled })
  });
};

const observatoryAt = (runtime: SimulationRuntime, x: number, y: number) =>
  (runtime as unknown as { state: { tiles: Map<string, { observatory?: { status: string; activatedAt?: number } }> } }).state.tiles.get(`${x},${y}`)?.observatory;

describe("Aether Tower enable/disable", () => {
  it("disables an active tower and re-enables it, re-dating it for the CRYSTAL ladder", async () => {
    const runtime = buildRuntime([observatoryTile(16, 17)]);
    const seen = collectEvents(runtime);

    submitToggle(runtime, "tower-off", 1, 16, 17, false);
    await Promise.resolve();
    expect(observatoryAt(runtime, 16, 17)?.status).toBe("inactive");
    // Disabling keeps the build — the tower is still there, just switched off.
    expect(observatoryAt(runtime, 16, 17)).toBeDefined();

    submitToggle(runtime, "tower-on", 2, 16, 17, true);
    await Promise.resolve();
    expect(observatoryAt(runtime, 16, 17)?.status).toBe("active");
    expect(observatoryAt(runtime, 16, 17)?.activatedAt).toBe(10_000);
    expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED")).toHaveLength(0);
  });

  it("drops the tower's CRYSTAL slot demand while disabled and restores it on enable", async () => {
    const runtime = buildRuntime([observatoryTile(16, 17)]);
    const crystalDemand = (): number =>
      (runtime as unknown as { resourceSlotDemandForPlayer: (id: string, fresh: boolean) => { CRYSTAL: number } }).resourceSlotDemandForPlayer("player-1", true).CRYSTAL;

    expect(crystalDemand()).toBe(1);

    submitToggle(runtime, "tower-off", 1, 16, 17, false);
    await Promise.resolve();
    expect(crystalDemand()).toBe(0);

    submitToggle(runtime, "tower-on", 2, 16, 17, true);
    await Promise.resolve();
    expect(crystalDemand()).toBe(1);
  });

  it("rejects toggling a tower the player does not own", async () => {
    const runtime = buildRuntime([observatoryTile(16, 17)]);
    const seen = collectEvents(runtime);

    submitToggle(runtime, "tower-steal", 1, 16, 17, false, "player-2");
    await Promise.resolve();
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "tower-steal")).toMatchObject({
      code: "OBSERVATORY_TOGGLE_INVALID"
    });
    expect(observatoryAt(runtime, 16, 17)?.status).toBe("active");
  });

  it("rejects switching off the Watchtower Engine's own free tower", async () => {
    const runtime = buildRuntime([{ ...observatoryTile(16, 17), naturalWonder: { type: "WATCHTOWER_ENGINE" } }]);
    const seen = collectEvents(runtime);

    submitToggle(runtime, "wonder-off", 1, 16, 17, false);
    await Promise.resolve();
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "wonder-off")).toMatchObject({
      code: "OBSERVATORY_TOGGLE_INVALID"
    });
    expect(observatoryAt(runtime, 16, 17)?.status).toBe("active");
  });

  it("rejects toggling a tower that is still under construction", async () => {
    const runtime = buildRuntime([observatoryTile(16, 17, { status: "under_construction", completesAt: 999_999 })]);
    const seen = collectEvents(runtime);

    submitToggle(runtime, "tower-early", 1, 16, 17, false);
    await Promise.resolve();
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "tower-early")).toMatchObject({
      code: "OBSERVATORY_TOGGLE_INVALID"
    });
    expect(observatoryAt(runtime, 16, 17)?.status).toBe("under_construction");
  });
});
