import type { VisibilityState } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { stampVisibilityAndMergeFogDeltas } from "./tile-delta-visibility-stamp.js";
import type { TileDeltaVisibilityFilterOptions } from "./tile-delta-visibility-filter.js";

/**
 * Builds the per-subscriber filtered + fog/reveal-stamped delta set for one
 * TILE_DELTA_BATCH event: visibility-filters the batch's own deltas, then
 * merges in explicit FOG deltas for tiles that left vision and explicit
 * VISIBLE reveal deltas for tiles that newly entered vision this batch (see
 * tile-delta-visibility-stamp.ts). Extracted out of simulation-service.ts's
 * TILE_DELTA_BATCH fanout loop purely to keep that already-oversized file
 * from growing further (see AGENTS.md file-line-limit rule).
 */
export interface TileDeltaFanoutFilterDeps<TDelta> {
  readonly filterTileDeltasForPlayer: (tileDeltas: readonly TDelta[], playerId: string, options?: TileDeltaVisibilityFilterOptions) => TDelta[];
  readonly wireDeltaForTileKey: (tileKey: string) => TDelta | undefined;
}

export const buildFilteredTileDeltasForSubscriber = <
  TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }
>(
  tileDeltas: readonly TDelta[],
  subscribedPlayerId: string,
  visionTransitions: { readonly entered: ReadonlyMap<string, ReadonlySet<string>>; readonly left: ReadonlyMap<string, ReadonlySet<string>> },
  deps: TileDeltaFanoutFilterDeps<TDelta>
): TDelta[] =>
  stampVisibilityAndMergeFogDeltas(deps.filterTileDeltasForPlayer(tileDeltas, subscribedPlayerId, { includeOwnershipClears: true }), {
    leftVisionTileKeys: visionTransitions.left.get(subscribedPlayerId),
    enteredVisionTileKeys: visionTransitions.entered.get(subscribedPlayerId),
    wireDeltaForTileKey: deps.wireDeltaForTileKey,
    tileKeyFor: simulationTileKey
  });
