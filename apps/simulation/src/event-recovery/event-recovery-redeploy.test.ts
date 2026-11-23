import { expect, it } from "vitest";
import { applySimulationEventsToRecoveredState } from "./event-recovery.js";

// A redeploy since the last checkpoint must survive a restart, or a crash
// could cost a House its Never Gave Up / Comeback Kid award.
it("replays redeploys marked on landing batches since the last checkpoint", () => {
  const before = { tiles: [], activeLocks: [], players: [{ id: "a", redeploys: 2 }, { id: "b" }] };
  const after = applySimulationEventsToRecoveredState(before, [
    { eventType: "TILE_DELTA_BATCH", commandId: "lock-1:respawn:a", playerId: "a", redeploy: true, tileDeltas: [] },
    { eventType: "TILE_DELTA_BATCH", commandId: "lock-2:respawn:b", playerId: "b", redeploy: true, tileDeltas: [] },
    { eventType: "TILE_DELTA_BATCH", commandId: "expand-1", playerId: "b", tileDeltas: [] }
  ]);
  expect(after.players).toEqual([{ id: "a", redeploys: 3 }, { id: "b", redeploys: 1 }]);
  expect(before.players[0]!.redeploys).toBe(2);
});
