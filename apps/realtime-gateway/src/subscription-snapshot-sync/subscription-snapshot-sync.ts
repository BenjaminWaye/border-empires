import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// applyPlayerMessageToSnapshot used to live here too, as a field-by-field
// copy of apps/simulation's identically-named function -- the two drifted
// at least twice (see docs/player-wire-refactor-plan.md and its Phase 1+2
// follow-up) before being unified into @border-empires/sim-protocol's
// subscription-snapshot-merge module, which every caller of this function
// now imports from instead.
type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

// Cache tile key → array-index for each tiles array so applyTileDeltasToSnapshot
// can look up positions in O(delta) instead of scanning O(N_tiles) every call.
// WeakMap ensures the index is GC'd alongside the tiles array itself.
const tileIndexByArray = new WeakMap<
  ReadonlyArray<TileDelta>,
  Map<string, number>
>();

const buildTileIndex = (tiles: ReadonlyArray<TileDelta>): Map<string, number> => {
  const index = new Map<string, number>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    index.set(tileKeyFor(t.x, t.y), i);
  }
  return index;
};

export const applyTileDeltasToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  tileDeltas: TileDelta[]
): PlayerSubscriptionSnapshot => {
  if (tileDeltas.length === 0) return snapshot;

  // Get or build the key→index map for this tiles array. O(N) only on first
  // call per array reference; subsequent calls are O(delta).
  let index = tileIndexByArray.get(snapshot.tiles);
  if (!index) {
    index = buildTileIndex(snapshot.tiles);
    tileIndexByArray.set(snapshot.tiles, index);
  }

  // Shallow-copy the array so we can update individual positions without
  // mutating the existing snapshot (immutable update pattern).
  const nextTiles = snapshot.tiles.slice() as TileDelta[];
  let hasInsertions = false;

  for (const delta of tileDeltas) {
    const key = tileKeyFor(delta.x, delta.y);
    const pos = index.get(key);
    if (pos !== undefined) {
      nextTiles[pos] = { ...nextTiles[pos]!, ...delta };
    } else if (!delta.ownershipClearOnly) {
      // A clear-only delta is a broadcast-only ghost-ownership cleanup for a
      // tile the player cannot see (see tile-delta-visibility-filter.ts). It
      // may update an already-visible snapshot tile (handled above), but must
      // NEVER insert a new one — inserting accumulates phantom non-visible
      // tiles that leak fog-of-war when the cached snapshot is served on a
      // later reconnect.
      nextTiles.push({ ...delta });
      hasInsertions = true;
    }
  }

  if (hasInsertions) {
    nextTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    // Array positions shifted by sort — rebuild the index from scratch.
    tileIndexByArray.set(nextTiles, buildTileIndex(nextTiles));
  } else {
    // No insertions: positions unchanged, reuse the same index for the next call.
    tileIndexByArray.set(nextTiles, index);
  }

  return { ...snapshot, tiles: nextTiles };
};
