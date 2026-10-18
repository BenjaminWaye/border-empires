import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Shutdown regression: the final checkpoint's export yields to the event loop,
// and scheduled tasks (here a combat-lock resolution) used to keep changing
// the world in between, so the snapshot could hold tiles from before a
// resolution and locks from after it -- an attack that vanished on reboot.
const buildExpandingRuntime = () => {
  let now = 1_000;
  const scheduled: Array<() => void> = [];
  const runtime = new SimulationRuntime({
    now: () => now,
    scheduleAfter: (_delayMs, task) => { scheduled.push(task); },
    seedTiles: new Map(),
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 10, terrain: "LAND" }
      ],
      activeLocks: []
    }
  });
  runtime.submitCommand({
    commandId: "freeze-expand",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: now,
    type: "EXPAND",
    payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
  });
  const runScheduled = async (): Promise<void> => {
    now += 60_000;
    // Tasks may schedule follow-ups; drain until quiet.
    for (let round = 0; round < 10 && scheduled.length > 0; round += 1) {
      for (const task of scheduled.splice(0)) task();
      await Promise.resolve();
    }
  };
  const targetOwner = () => runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10)?.ownerId;
  const activeLockIds = () => runtime.exportSnapshotSections().initialState.activeLocks.map((lock) => lock.commandId);
  return { runtime, runScheduled, targetOwner, activeLockIds };
};

describe("SimulationRuntime.freezeScheduledTasks", () => {
  it("resolves the EXPAND lock when scheduled tasks run normally (control)", async () => {
    const { runScheduled, targetOwner, activeLockIds } = buildExpandingRuntime();
    await Promise.resolve();
    expect(activeLockIds()).toContain("freeze-expand");
    await runScheduled();
    expect(targetOwner()).toBe("player-1");
    expect(activeLockIds()).not.toContain("freeze-expand");
  });

  it("leaves the lock pending (and the snapshot consistent) once frozen", async () => {
    const { runtime, runScheduled, targetOwner, activeLockIds } = buildExpandingRuntime();
    await Promise.resolve();
    runtime.freezeScheduledTasks();
    await runScheduled();
    expect(targetOwner()).toBeUndefined();
    expect(activeLockIds()).toContain("freeze-expand");
  });
});
