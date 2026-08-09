import type { VisibilityState } from "@border-empires/shared";

/**
 * Stamps `visibilityState` onto each already-filtered (visible) delta for a
 * player and merges in explicit FOG deltas for tiles that left that
 * player's vision this batch, and explicit VISIBLE reveal deltas for tiles
 * that newly entered vision this batch (see runtime-vision-transition.ts).
 * Part of the fog-of-war "witness-flip-then-fog" mechanism: a tile that
 * leaves vision this tick is frozen client-side at its final post-mutation
 * state (e.g. the new owner from a same-tick capture), tagged FOG, instead
 * of silently going stale or being force-included via the old
 * includeOwnershipClears rescue path.
 *
 * The entered-tile merge is what actually reveals the leading edge of fog
 * when a player's vision footprint grows (EXPAND/ATTACK captures, alliance
 * formed, vision-radius tech/domain picks, etc.) — `event.tileDeltas` only
 * ever carries whatever the command handler explicitly built (e.g. just the
 * captured tile for EXPAND, see runtime-lock-resolution.ts), so without this
 * merge any tile that enters vision without being part of that explicit set
 * would never be sent and would stay permanently fogged on the client.
 *
 * Generic over the delta shape (mirrors filterTileDeltasForPlayer) since
 * callers pass whichever SimulationEvent-flavoured tile-delta type they
 * have on hand (they are structurally near-identical but not nominally the
 * same type across sim-protocol/runtime-types).
 */
export interface VisibilityStampDeps<TDelta> {
  readonly leftVisionTileKeys: ReadonlySet<string> | undefined;
  readonly enteredVisionTileKeys: ReadonlySet<string> | undefined;
  readonly wireDeltaForTileKey: (tileKey: string) => TDelta | undefined;
  readonly tileKeyFor: (x: number, y: number) => string;
}

export const stampVisibilityAndMergeFogDeltas = <TDelta extends { x: number; y: number; visibilityState?: VisibilityState | undefined }>(
  filteredDeltas: readonly TDelta[],
  deps: VisibilityStampDeps<TDelta>
): TDelta[] => {
  const leftKeys = deps.leftVisionTileKeys;
  const enteredKeys = deps.enteredVisionTileKeys;
  if ((!leftKeys || leftKeys.size === 0) && (!enteredKeys || enteredKeys.size === 0)) {
    return filteredDeltas.map((delta) => ({ ...delta, visibilityState: "VISIBLE" as const }));
  }
  const seenKeys = new Set<string>();
  const result: TDelta[] = [];
  for (const delta of filteredDeltas) {
    const tileKey = deps.tileKeyFor(delta.x, delta.y);
    seenKeys.add(tileKey);
    if (leftKeys?.has(tileKey)) {
      // Prefer the full FOG-stamped current-state delta over whatever the
      // normal filter produced for this tile this batch (they may differ —
      // e.g. a redacted lock-target stub — see spec: "prefer the
      // FOG-stamped version but keep the full field set").
      const fogDelta = deps.wireDeltaForTileKey(tileKey);
      result.push(fogDelta ? { ...fogDelta, visibilityState: "FOG" as const } : { ...delta, visibilityState: "FOG" as const });
    } else if (enteredKeys?.has(tileKey)) {
      // Symmetric case: the tile is ALSO already present in this batch's own
      // event deltas -- e.g. it's the tile an EXPAND/ATTACK just captured,
      // which is included in event.tileDeltas regardless of vision. That
      // event delta comes from the sparse-diffed tileDeltaFromState path,
      // whose overlay JSON fields (naturalWonderJson, fortJson, ...) are
      // diffed against a GLOBAL cross-player "last emitted" baseline -- if
      // some other player's earlier reveal already touched this tile, the
      // field reads as "unchanged" and gets dropped, even though THIS
      // player is seeing the tile for the first time and never received it.
      // Falling through to the plain `else` below would ship that
      // field-dropped delta as this player's first-ever record of the tile.
      // Merge in the always-full reveal-only delta instead (same reasoning
      // as the leftKeys branch above), rather than replacing outright: the
      // reveal builder omits transient/live fields (yield/yieldRate/yieldCap,
      // combatJson) that the batch's own delta may carry and that a plain
      // replace would silently drop for this one viewer (e.g. losing the
      // battle-overlay FX for an ATTACK that also reveals its target). Spread
      // order matters -- revealDelta's keys (guaranteed present/correct)
      // must win over delta's for any field both define.
      const revealDelta = deps.wireDeltaForTileKey(tileKey);
      result.push(revealDelta ? { ...delta, ...revealDelta, visibilityState: "VISIBLE" as const } : { ...delta, visibilityState: "VISIBLE" as const });
    } else {
      result.push({ ...delta, visibilityState: "VISIBLE" as const });
    }
  }
  // A tile can leave vision this tick without appearing in the normal
  // filtered set at all (e.g. it left via resyncVisionRadius/alliance
  // change with no tile mutation of its own this batch) — still owed an
  // explicit FOG delta so the client freezes it instead of going stale.
  for (const tileKey of leftKeys ?? []) {
    if (seenKeys.has(tileKey)) continue;
    const fogDelta = deps.wireDeltaForTileKey(tileKey);
    if (fogDelta) result.push({ ...fogDelta, visibilityState: "FOG" as const });
  }
  // Symmetric case for entering vision: a tile can newly enter this tick
  // without appearing in the normal filtered set at all (e.g. it entered as
  // part of a capture's expanding vision footprint but only the captured
  // tile itself was included in the event's explicit tileDeltas) — still
  // owed an explicit VISIBLE reveal delta so the client actually discovers
  // it instead of staying fogged forever.
  for (const tileKey of enteredKeys ?? []) {
    if (seenKeys.has(tileKey)) continue;
    const revealDelta = deps.wireDeltaForTileKey(tileKey);
    if (revealDelta) result.push({ ...revealDelta, visibilityState: "VISIBLE" as const });
  }
  return result;
};
