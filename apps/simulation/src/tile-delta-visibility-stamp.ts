import type { VisibilityState } from "@border-empires/shared";

/**
 * Stamps `visibilityState` onto each already-filtered (visible) delta for a
 * player and merges in explicit FOG deltas for tiles that left that
 * player's vision this batch (see runtime-vision-transition.ts). Part of
 * the fog-of-war "witness-flip-then-fog" mechanism: a tile that leaves
 * vision this tick is frozen client-side at its final post-mutation state
 * (e.g. the new owner from a same-tick capture), tagged FOG, instead of
 * silently going stale or being force-included via the old
 * includeOwnershipClears rescue path.
 *
 * Generic over the delta shape (mirrors filterTileDeltasForPlayer) since
 * callers pass whichever SimulationEvent-flavoured tile-delta type they
 * have on hand (they are structurally near-identical but not nominally the
 * same type across sim-protocol/runtime-types).
 */
export interface VisibilityStampDeps<TDelta> {
  readonly leftVisionTileKeys: ReadonlySet<string> | undefined;
  readonly wireDeltaForTileKey: (tileKey: string) => TDelta | undefined;
  readonly tileKeyFor: (x: number, y: number) => string;
}

export const stampVisibilityAndMergeFogDeltas = <TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }>(
  filteredDeltas: readonly TDelta[],
  deps: VisibilityStampDeps<TDelta>
): TDelta[] => {
  const leftKeys = deps.leftVisionTileKeys;
  if (!leftKeys || leftKeys.size === 0) {
    return filteredDeltas.map((delta) => ({ ...delta, visibilityState: "VISIBLE" as const }));
  }
  const seenKeys = new Set<string>();
  const result: TDelta[] = [];
  for (const delta of filteredDeltas) {
    const tileKey = deps.tileKeyFor(delta.x, delta.y);
    seenKeys.add(tileKey);
    if (leftKeys.has(tileKey)) {
      // Prefer the full FOG-stamped current-state delta over whatever the
      // normal filter produced for this tile this batch (they may differ —
      // e.g. a redacted lock-target stub — see spec: "prefer the
      // FOG-stamped version but keep the full field set").
      const fogDelta = deps.wireDeltaForTileKey(tileKey);
      result.push(fogDelta ? { ...fogDelta, visibilityState: "FOG" as const } : { ...delta, visibilityState: "FOG" as const });
    } else {
      result.push({ ...delta, visibilityState: "VISIBLE" as const });
    }
  }
  // A tile can leave vision this tick without appearing in the normal
  // filtered set at all (e.g. it left via resyncVisionRadius/alliance
  // change with no tile mutation of its own this batch) — still owed an
  // explicit FOG delta so the client freezes it instead of going stale.
  for (const tileKey of leftKeys) {
    if (seenKeys.has(tileKey)) continue;
    const fogDelta = deps.wireDeltaForTileKey(tileKey);
    if (fogDelta) result.push({ ...fogDelta, visibilityState: "FOG" as const });
  }
  return result;
};
