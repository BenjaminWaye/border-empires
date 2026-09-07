import type { ReachContestedDirtyState } from "./runtime-reach-contested-tiles.js";

/** Everything {@link flushContestedTileReachUpdates} needs from the runtime. */
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
 * Flushes every dirty contested tile (see runtime-reach-contested-tiles.ts)
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
 */
export const flushContestedTileReachUpdates = <TTile, TDelta>(
  state: ReachContestedDirtyState,
  context: ReachContestedFlushContext<TTile, TDelta>,
  causeCommandId: string
): number => {
  if (state.dirtyContestedTileKeys.size === 0) return 0;
  const candidates = [...state.dirtyContestedTileKeys];
  state.dirtyContestedTileKeys.clear();

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
