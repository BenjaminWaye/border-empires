import type { ReachChangedTilesDirtyState } from "./runtime-reach-contested-tiles.js";

/** Everything {@link flushChangedReachTileUpdates} needs from the runtime. */
export type ReachContestedFlushContext<TTile, TDelta> = {
  /** Current domain tile state for a tile key, if the tile exists. */
  getTile: (tileKey: string) => TTile | undefined;
  /** Builds the wire-format delta for a tile, including a fresh `reachOwnerId`. */
  tileDeltaFromState: (tile: TTile) => TDelta;
  /** Emits a TILE_DELTA_BATCH event. Fanned out per-subscriber (with vision
   * filtering) downstream in simulation-service.ts — this is a single
   * broadcast-shaped emission, not a per-viewer loop. */
  emitEvent: (event: { eventType: "TILE_DELTA_BATCH"; commandId: string; playerId: string; tileDeltas: TDelta[] }) => void;
};

/**
 * Flushes every dirty changed-reach tile (see runtime-reach-contested-tiles.ts)
 * as fresh TILE_DELTA_BATCH deltas — recomputed via `tileDeltaFromState`, so
 * each carries the current `reachOwnerId` off `Runtime.reachBorder`. Grouped
 * by the tile's *current actual owner* (mirrors runtime-out-of-reach-decay.ts's
 * grouping convention) purely for event attribution; the downstream fanout in
 * simulation-service.ts filters each subscriber's own vision independently of
 * this grouping, so an unowned/neutral tile's group key of "" is fine — it
 * still reaches every subscriber who can see that tile.
 *
 * Snapshot-before-iterate, matching flushReachUpdates: emitEvent can re-enter
 * the runtime, and a mutation mid-walk would otherwise invalidate the
 * iterator.
 *
 * Cost note: this dirty set is no longer filtered by border adjacency (see
 * runtime-reach-contested-tiles.ts). The diff itself
 * (markChangedReachTilesDirty) is scoped to the triggering anchor's own disk
 * (<= (2*OUTPOST_REACH_RADIUS+1)^2 = 121 tiles), not a full-border walk --
 * see that function's doc comment -- so even an eliminated empire's worth of
 * anchors deactivating in one command (one call per anchor) costs O(anchors
 * x radius^2), never O(total border size). This flush adds one `getTile` +
 * `tileDeltaFromState` call per changed key plus the grouped emits, bounded
 * by the number of tiles that actually moved between flushes, not by world
 * size -- it does not introduce a new per-tick cost class, it is
 * proportional to how much reach genuinely changed.
 */
export const flushContestedTileReachUpdates = <TTile, TDelta>(
  state: ReachChangedTilesDirtyState,
  context: ReachContestedFlushContext<TTile, TDelta>,
  causeCommandId: string
): number => {
  if (state.dirtyChangedTileKeys.size === 0) return 0;
  const candidates = [...state.dirtyChangedTileKeys];
  state.dirtyChangedTileKeys.clear();

  const deltasByOwnerGroup = new Map<string, TDelta[]>();
  for (const tileKey of candidates) {
    const tile = context.getTile(tileKey);
    if (!tile) continue;
    const ownerGroup = (tile as { ownerId?: string | undefined }).ownerId ?? "";
    const delta = context.tileDeltaFromState(tile);
    const group = deltasByOwnerGroup.get(ownerGroup);
    if (group) {
      group.push(delta);
    } else {
      deltasByOwnerGroup.set(ownerGroup, [delta]);
    }
  }

  let emittedTileCount = 0;
  for (const [ownerGroup, tileDeltas] of deltasByOwnerGroup) {
    if (tileDeltas.length === 0) continue;
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `reach-contested:${causeCommandId}`,
      playerId: ownerGroup,
      tileDeltas
    });
    emittedTileCount += tileDeltas.length;
  }
  return emittedTileCount;
};
