import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression: explored land turned back into unexplored storm for players
// after a restart/reconnect. Fog memory lived only in the browser, so the
// simulation had nothing to restore it from. It now keeps per-player explored
// tiles, saves them in snapshots, and restores them on boot.
const buildRuntime = (ownedAt: { x: number; y: number }, initialState?: ReturnType<SimulationRuntime["exportSnapshotSections"]>["initialState"]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["explorer-1", buildPlayer("explorer-1", { mods: { attack: 1, defense: 1, income: 1, vision: 1 } })]]),
    initialState: {
      // reachBorder is dropped so the old territory's reach can't keep (10,10) in live vision.
      ...(initialState ? { ...initialState, reachBorder: [] } : {}),
      tiles: [{ x: ownedAt.x, y: ownedAt.y, terrain: "LAND", ownerId: "explorer-1", ownershipState: "SETTLED" }],
      activeLocks: []
    }
  });

const isExplored = (runtime: SimulationRuntime, x: number, y: number): boolean => {
  const runs = runtime.fogMemoryFor("explorer-1").exploredTiles;
  if (!runs) return false;
  let cell = 0;
  let explored = false;
  const target = y * runs.width + x;
  for (const run of runs.runs) {
    if (target < cell + run) return explored;
    cell += run;
    explored = !explored;
  }
  return false;
};

describe("simulation runtime — explored tiles survive restart", () => {
  it("records tiles in vision as explored", () => {
    const runtime = buildRuntime({ x: 10, y: 10 });
    expect(isExplored(runtime, 10, 10)).toBe(true);
    expect(isExplored(runtime, 11, 11)).toBe(true);
    expect(isExplored(runtime, 200, 200)).toBe(false);
  });

  it("keeps tiles explored after a restart even when they are no longer in vision", () => {
    const first = buildRuntime({ x: 10, y: 10 });
    const snapshot = first.exportSnapshotSections().initialState;
    expect(snapshot.exploredTiles?.map((entry) => entry.playerId)).toEqual(["explorer-1"]);

    // After the restart the player's territory is elsewhere: (10,10) is out of vision.
    const restarted = buildRuntime({ x: 200, y: 200 }, snapshot);
    expect(isExplored(restarted, 200, 200)).toBe(true);
    expect(isExplored(restarted, 10, 10)).toBe(true);
    expect(isExplored(restarted, 11, 11)).toBe(true);
  });

  it("starts empty on a snapshot written before explored tiles were saved", () => {
    const first = buildRuntime({ x: 10, y: 10 });
    const { exploredTiles: _dropped, ...legacy } = first.exportSnapshotSections().initialState;
    const restarted = buildRuntime({ x: 200, y: 200 }, legacy);
    expect(isExplored(restarted, 10, 10)).toBe(false);
    expect(isExplored(restarted, 200, 200)).toBe(true);
  });
});
