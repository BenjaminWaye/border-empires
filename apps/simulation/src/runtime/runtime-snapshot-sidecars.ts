import type { ExploredTilesStore } from "../explored-tiles/explored-tiles-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import type { SpawnPlacementIndex } from "../spawn-placement/spawn-placement-index.js";

/**
 * Small, fixed-shape pieces of runtime state that ride in snapshots beside
 * the tiles: per-player explored-tile memory and the season's worldgen
 * starting-site roster. Kept out of runtime.ts, which is over the file-line cap.
 */
export type RuntimeSnapshotSidecars = {
  exploredTiles: ExploredTilesStore;
  spawnPlacementIndex: SpawnPlacementIndex;
};

export const restoreRuntimeSnapshotSidecars = (
  sidecars: RuntimeSnapshotSidecars,
  initialState: Pick<RecoveredSimulationState, "exploredTiles" | "fairSpawnSites"> | undefined
): void => {
  sidecars.exploredTiles.restore(initialState?.exploredTiles);
  sidecars.spawnPlacementIndex.restoreFairSpawnSites(initialState?.fairSpawnSites);
};

export const runtimeSnapshotSidecarExports = (sidecars: RuntimeSnapshotSidecars, hasPlayer: (playerId: string) => boolean) => ({
  exploredTiles: () => {
    sidecars.exploredTiles.retainOnly(hasPlayer);
    return sidecars.exploredTiles.exportSnapshot();
  },
  fairSpawnSites: () => sidecars.spawnPlacementIndex.persistedFairSpawnSites()
});
