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
  readonly wireDeltaForTileKey: (tileKey: string, playerId: string) => TDelta | undefined;
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
    wireDeltaForTileKey: (tileKey) => deps.wireDeltaForTileKey(tileKey, subscribedPlayerId),
    tileKeyFor: simulationTileKey
  });

/** `message_type` that marks a TILE_DELTA_BATCH as a spectator's unfiltered copy. */
export const SPECTATOR_TILE_DELTA_MESSAGE_TYPE = "SPECTATOR";

export interface RuntimeTileDeltaFanout<TDelta> {
  /** The ordinary fog-filtered, fog/reveal-stamped set for one subscriber. */
  filter: (
    tileDeltas: readonly TDelta[],
    subscribedPlayerId: string,
    visionTransitions: Parameters<typeof buildFilteredTileDeltasForSubscriber>[2]
  ) => TDelta[];
  /**
   * Extra per-spectator events for one batch: every delta, unfiltered and
   * stamped VISIBLE, tagged SPECTATOR. A spectator (fog admin with the map
   * revealed) also keeps getting their ordinary filtered event; the gateway
   * sends the tagged copy only to revealed sockets and the filtered one only
   * to fogged sockets and its own snapshot cache, so nothing unfiltered ever
   * reaches a fogged view. This is what keeps a revealed map current at a
   * cost proportional to what changed; re-exporting the whole world per
   * change stalled the server (docs/load-results/full-reveal-2026-11-23.md).
   */
  spectatorEvents: <TEvent extends { player_id: string }>(
    tileDeltas: readonly TDelta[],
    spectatorIds: readonly string[],
    toEvent: (tileDeltas: TDelta[]) => TEvent
  ) => Array<TEvent & { message_type: string }>;
}

/**
 * Wires the fan-out to the live runtime. `runtime` is a thunk because the
 * service creates this before the runtime binding it closes over is assigned.
 */
export const createRuntimeTileDeltaFanout = <
  TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }
>(
  runtime: () => {
    filterTileDeltasForPlayer: (tileDeltas: readonly TDelta[], playerId: string, options?: TileDeltaVisibilityFilterOptions) => TDelta[];
    wireDeltaForTileKey: (tileKey: string, playerId: string) => unknown;
  }
): RuntimeTileDeltaFanout<TDelta> => ({
  filter: (tileDeltas, subscribedPlayerId, visionTransitions) =>
    buildFilteredTileDeltasForSubscriber(tileDeltas, subscribedPlayerId, visionTransitions, {
      filterTileDeltasForPlayer: (deltas, playerId, options) => runtime().filterTileDeltasForPlayer(deltas, playerId, options),
      wireDeltaForTileKey: (tileKey, playerId) => runtime().wireDeltaForTileKey(tileKey, playerId) as TDelta | undefined
    }),
  spectatorEvents: (tileDeltas, spectatorIds, toEvent) => {
    if (spectatorIds.length === 0 || tileDeltas.length === 0) return [];
    // Serialized once per batch and shared by every spectator.
    const shared = toEvent(tileDeltas.map((delta) => ({ ...delta, visibilityState: "VISIBLE" as const })));
    return spectatorIds.map((playerId) => ({ ...shared, player_id: playerId, message_type: SPECTATOR_TILE_DELTA_MESSAGE_TYPE }));
  }
});
