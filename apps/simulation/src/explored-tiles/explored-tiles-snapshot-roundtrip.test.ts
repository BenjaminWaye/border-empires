import { describe, expect, it } from "vitest";

import { applySimulationEventsToRecoveredState, type RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage, expandSnapshotFromStorage } from "../snapshot-compaction/snapshot-compaction.js";

// The saved fog memory must survive every step a real restart takes:
// compaction for storage, expansion on load, and event-recovery replay.
const exploredTiles = [{ playerId: "p1", width: 640, height: 320, runs: [10, 3, 600, 2] }];
const baselineTiles: RecoveredSimulationState["tiles"] = [{ x: 0, y: 0, terrain: "LAND" }];

describe("explored tiles in snapshots", () => {
  it("survives compaction and expansion", async () => {
    const compact = await compactSnapshotForStorage(
      { initialState: { tiles: [...baselineTiles], activeLocks: [], exploredTiles }, commandEvents: [] },
      buildWorldgenBaselineIndex(baselineTiles)
    );
    const expanded = expandSnapshotFromStorage(JSON.parse(JSON.stringify(compact)), baselineTiles);
    expect(expanded.initialState.exploredTiles).toEqual(exploredTiles);
  });

  it("survives event-recovery replay", () => {
    const recovered = applySimulationEventsToRecoveredState({ tiles: [...baselineTiles], activeLocks: [], exploredTiles }, []);
    expect(recovered.exploredTiles).toEqual(exploredTiles);
  });
});
