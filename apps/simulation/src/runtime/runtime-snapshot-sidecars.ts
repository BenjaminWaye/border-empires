import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { ExploredTilesStore } from "../explored-tiles/explored-tiles-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import type { SpawnPlacementIndex } from "../spawn-placement/spawn-placement-index.js";
import type { PlanetaryDefenseCamps } from "../planetary-defense-camps/camp-runtime.js";
import type { LostTile } from "../lost-tile-memory/lost-tile-memory.js";

/**
 * Small, fixed-shape pieces of runtime state that ride in snapshots beside
 * the tiles: per-player explored-tile memory, the season's worldgen
 * starting-site roster, and the Planetary Defense planner's camp rest and raid
 * counts. Kept out of runtime.ts, which is over the file-line cap.
 */
export type { ExploredTilesStore };

/** A player's fog memory for the subscribe reply: explored tiles, and who took the land they lost (lost-tile-memory.ts). */
export type FogMemory = { exploredTiles: ReturnType<ExploredTilesStore["encodedFor"]>; lostTiles: LostTile[] };

/** Per-player fog memory sized to the world, saved in snapshots (explored-tiles-store.ts). */
export const createRuntimeExploredTilesStore = (): ExploredTilesStore => new ExploredTilesStore(WORLD_WIDTH, WORLD_HEIGHT);

export type RuntimeSnapshotSidecars = {
  exploredTiles: ExploredTilesStore;
  spawnPlacementIndex: SpawnPlacementIndex;
  planetaryDefenseCamps: Pick<PlanetaryDefenseCamps, "restorePlannerState" | "exportPlannerState">;
};

export const restoreRuntimeSnapshotSidecars = (
  sidecars: RuntimeSnapshotSidecars,
  initialState: Pick<RecoveredSimulationState, "exploredTiles" | "fairSpawnSites" | "planetaryDefensePlanner"> | undefined
): void => {
  sidecars.exploredTiles.restore(initialState?.exploredTiles);
  sidecars.spawnPlacementIndex.restoreFairSpawnSites(initialState?.fairSpawnSites);
  sidecars.planetaryDefenseCamps.restorePlannerState(initialState?.planetaryDefensePlanner);
};

export const runtimeSnapshotSidecarExports = (sidecars: RuntimeSnapshotSidecars, hasPlayer: (playerId: string) => boolean) => ({
  exploredTiles: () => {
    sidecars.exploredTiles.retainOnly(hasPlayer);
    return sidecars.exploredTiles.exportSnapshot();
  },
  fairSpawnSites: () => sidecars.spawnPlacementIndex.persistedFairSpawnSites(),
  planetaryDefensePlanner: () => sidecars.planetaryDefenseCamps.exportPlannerState()
});
