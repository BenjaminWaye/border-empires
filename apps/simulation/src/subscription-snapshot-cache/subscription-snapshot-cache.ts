import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// applyPlayerMessageToSnapshot used to live here too, as a field-by-field
// copy of apps/realtime-gateway's identically-named function -- the two
// drifted at least twice (see docs/player-wire-refactor-plan.md) before
// being unified into
// @border-empires/sim-protocol's subscription-snapshot-merge module, which
// every caller of this function now imports from instead.
type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

// Binary search in a sorted tiles array (sorted by x asc, then y asc).
// Returns the index if found, or ~insertionPoint (bitwise NOT) if not found.
// Avoids the O(n) Map rebuild on every tile-delta application for the common
// case where the delta tiles are already visible in the snapshot.
const binarySearchTile = (tiles: readonly TileDelta[], x: number, y: number): number => {
  let lo = 0;
  let hi = tiles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = tiles[mid]!;
    const dx = t.x - x;
    if (dx < 0) { lo = mid + 1; continue; }
    if (dx > 0) { hi = mid - 1; continue; }
    const dy = t.y - y;
    if (dy < 0) { lo = mid + 1; continue; }
    if (dy > 0) { hi = mid - 1; continue; }
    return mid;
  }
  return ~lo;
};

export const applyTileDeltasToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  tileDeltas: TileDelta[]
): PlayerSubscriptionSnapshot => {
  if (tileDeltas.length === 0) return snapshot;

  // Fast path: binary search each delta in the already-sorted tiles array.
  // Updates (tiles already visible) are O(delta × log n) with no sort.
  // Only falls back to the O(n) Map+sort for insertions (new tiles entering
  // visibility), which is rare relative to state-update deltas.
  let updatedTiles: TileDelta[] | undefined;
  let inserts: TileDelta[] | undefined;

  for (const delta of tileDeltas) {
    const idx = binarySearchTile(snapshot.tiles, delta.x, delta.y);
    if (idx >= 0) {
      if (!updatedTiles) updatedTiles = snapshot.tiles.slice();
      updatedTiles[idx] = { ...updatedTiles[idx]!, ...delta };
    } else if (!delta.ownershipClearOnly) {
      // A clear-only delta is a broadcast-only ghost-ownership cleanup for a
      // tile the player cannot see (see tile-delta-visibility-filter.ts). It
      // may update an already-visible snapshot tile (handled above), but must
      // NEVER insert a new one — inserting accumulates phantom non-visible
      // tiles that leak fog-of-war when the cached snapshot is served on a
      // later reconnect.
      (inserts ??= []).push(delta);
    }
  }

  if (!inserts) {
    // All deltas were updates — no sort needed, array order preserved.
    return updatedTiles ? { ...snapshot, tiles: updatedTiles } : snapshot;
  }

  // At least one new tile: rebuild via Map to handle both updates and inserts.
  const base = updatedTiles ?? snapshot.tiles;
  const map = new Map<string, TileDelta>(base.map((t) => [tileKeyFor(t.x, t.y), t] as const));
  for (const delta of inserts) {
    const key = tileKeyFor(delta.x, delta.y);
    const existing: TileDelta = map.get(key) ?? { x: delta.x, y: delta.y };
    map.set(key, { ...existing, ...delta });
  }
  return {
    ...snapshot,
    tiles: [...map.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y))
  };
};
