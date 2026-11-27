import { describe, expect, it } from "vitest";

import { applySimulationEventsToRecoveredState, type RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage, expandSnapshotFromStorage } from "../snapshot-compaction/snapshot-compaction.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

// Review regression: each camp's rest and its raids per House were held in
// memory only, so every deploy reset a camp's raid allowance mid-window. They
// now ride in the snapshot beside the tiles (runtime-snapshot-sidecars.ts).
const planner: NonNullable<RecoveredSimulationState["planetaryDefensePlanner"]> = {
  camps: [{ campId: "70,70", restUntil: 9_000_000_000_000, raids: [{ houseId: "player-1", windowStart: 1_000, count: 3 }] }]
};
const baselineTiles: RecoveredSimulationState["tiles"] = [{ x: 0, y: 0, terrain: "LAND" }];

describe("Planetary Defense planner persistence", () => {
  it("survives snapshot compaction and expansion", async () => {
    const compact = await compactSnapshotForStorage(
      { initialState: { tiles: [...baselineTiles], activeLocks: [], planetaryDefensePlanner: planner }, commandEvents: [] },
      buildWorldgenBaselineIndex(baselineTiles)
    );
    const expanded = expandSnapshotFromStorage(JSON.parse(JSON.stringify(compact)), baselineTiles);
    expect(expanded.initialState.planetaryDefensePlanner).toEqual(planner);
  });

  it("survives event-recovery replay", () => {
    const recovered = applySimulationEventsToRecoveredState({ tiles: [...baselineTiles], activeLocks: [], planetaryDefensePlanner: planner }, []);
    expect(recovered.planetaryDefensePlanner).toEqual(planner);
  });

  it("a restarted runtime keeps it, before and after its planner first runs", () => {
    const tiles: RecoveredSimulationState["tiles"] = [{ x: 70, y: 70, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "70,70" }];
    const build = (initialState: RecoveredSimulationState) =>
      new SimulationRuntime({ now: () => 1_000, initialPlayers: new Map([["barbarian-1", buildPlayer("barbarian-1", { isAi: true })]]), initialState });
    const restarted = build({ tiles, activeLocks: [], planetaryDefensePlanner: planner });
    expect(restarted.exportSnapshotSections().initialState.planetaryDefensePlanner).toEqual(planner);
    restarted.barbarianBridge();
    // Once the planner runs, a saved rest is clamped to the longest rest (an expansion's) from now (a far-future value can't silence a camp).
    expect(restarted.exportSnapshotSections().initialState.planetaryDefensePlanner?.camps[0]).toMatchObject({ campId: "70,70", restUntil: 1_000 + 60_000 });
  });
});
