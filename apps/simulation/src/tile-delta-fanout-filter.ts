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

type VisionTransitions = Parameters<typeof buildFilteredTileDeltasForSubscriber>[2];

export interface SubscriberTileDeltaFilterDeps<TDelta> extends TileDeltaFanoutFilterDeps<TDelta> {
  readonly isSpectator: (playerId: string) => boolean;
  readonly groupKeyFor: (deltas: readonly TDelta[]) => string;
}

/**
 * The per-subscriber delta set for the TILE_DELTA_BATCH fanout loop.
 *
 * A spectator (fog admin with the map revealed) gets every delta in the batch
 * as-is, stamped VISIBLE: no visibility filter and no fog/reveal stamping from
 * their own territory's vision edges, which would re-fog tiles on a map that
 * is meant to stay fully revealed. This is what keeps a revealed map current
 * at a cost proportional to what changed -- the alternative, re-exporting the
 * whole world per change, stalled the simulation (docs/load-results/
 * full-reveal-2026-11-23.md).
 *
 * Spectator sets are never masked (hidden resources, waystation rewards), so
 * `groupKey` keeps them out of the serialization groups shared by ordinary
 * subscribers; sharing one would hand a masked viewer the unmasked payload.
 */
export const createSubscriberTileDeltaFilter = <
  TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }
>(deps: SubscriberTileDeltaFilterDeps<TDelta>): {
  filter: (tileDeltas: readonly TDelta[], subscribedPlayerId: string, visionTransitions: VisionTransitions) => TDelta[];
  groupKey: (subscribedPlayerId: string, filteredDeltas: readonly TDelta[]) => string;
} => ({
  filter: (tileDeltas, subscribedPlayerId, visionTransitions) =>
    deps.isSpectator(subscribedPlayerId)
      ? tileDeltas.map((delta) => ({ ...delta, visibilityState: "VISIBLE" as const }))
      : buildFilteredTileDeltasForSubscriber(tileDeltas, subscribedPlayerId, visionTransitions, deps),
  groupKey: (subscribedPlayerId, filteredDeltas) =>
    `${deps.isSpectator(subscribedPlayerId) ? "spectator|" : ""}${deps.groupKeyFor(filteredDeltas)}`
});

/**
 * Wires the filter to the live runtime. `runtime` is a thunk because the
 * service creates this before the runtime binding it closes over is assigned.
 */
export const createRuntimeSubscriberTileDeltaFilter = <
  TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }
>(
  runtime: () => {
    filterTileDeltasForPlayer: (tileDeltas: readonly TDelta[], playerId: string, options?: TileDeltaVisibilityFilterOptions) => TDelta[];
    wireDeltaForTileKey: (tileKey: string, playerId: string) => unknown;
  },
  registry: { isSpectator: (playerId: string) => boolean },
  groupKeyFor: (deltas: readonly TDelta[]) => string
): ReturnType<typeof createSubscriberTileDeltaFilter<TDelta>> =>
  createSubscriberTileDeltaFilter<TDelta>({
    isSpectator: (playerId) => registry.isSpectator(playerId),
    groupKeyFor,
    filterTileDeltasForPlayer: (deltas, playerId, options) => runtime().filterTileDeltasForPlayer(deltas, playerId, options),
    wireDeltaForTileKey: (tileKey, playerId) => runtime().wireDeltaForTileKey(tileKey, playerId) as TDelta | undefined
  });
