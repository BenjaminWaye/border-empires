// Durable backing for the season "deadliest tile" stat (season-stats.ts's
// findMostDeadlyTile). The live source of truth is runtime.manpowerLossByTileKey
// -- a per-tile running total accumulated by buildLockedCombatResolution
// (runtime-combat-support.ts) for the WHOLE season, with no TTL and no eviction.
//
// That map is in-memory only, so before this module a process restart (every
// prod deploy) silently reset the season's death counts to zero and the
// end-of-season "deadliest tile" only reflected combat since the last deploy.
//
// Why a bounded top-K blob rather than persisting the map itself:
//   - The map is keyed by tile key over a 450x450 (202,500 tile) world and
//     grows monotonically all season. Putting it in the world snapshot would
//     couple snapshot size to a monotonically growing structure -- the exact
//     anti-pattern docs/agents/state-and-persistence-discipline.md exists to
//     prevent (a 122k-entry cache once froze the sim event loop ~16s per
//     checkpoint). Snapshots are also delta-compacted against the worldgen
//     baseline (~5,147 elements in practice); per-tile damage totals are novel
//     data that compacts against nothing, so they would dominate the payload.
//   - findMostDeadlyTile only ever returns the single maximum. Persisting tens
//     of thousands of entries to recover one value is pure waste.
// A top-K blob is constant-size, is written on the season summary's existing
// persist cadence, and never touches the snapshot or any client broadcast.
//
// Accepted tradeoff: a tile ranked below K at restart loses its accumulated
// history and resumes from zero. With DEADLIEST_TILE_PERSIST_LIMIT below and a
// stat that is by definition an outlier, that is not a realistic mis-rank, and
// it is strictly better than today's total loss on every restart.

/** One tile's season-to-date combat manpower total. */
export type DeadliestTileEntry = {
  x: number;
  y: number;
  manpowerLost: number;
};

/**
 * How many tiles are kept. Sized to stay negligible as a JSON blob (~200
 * entries is a few KB) while leaving deep headroom below the single tile the
 * stat actually reports.
 */
export const DEADLIEST_TILE_PERSIST_LIMIT = 200;

const parseTileKey = (key: string): { x: number; y: number } | undefined => {
  const comma = key.indexOf(",");
  if (comma <= 0) return undefined;
  const x = Number(key.slice(0, comma));
  const y = Number(key.slice(comma + 1));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

/**
 * The `limit` tiles with the highest accumulated manpower loss, ordered
 * descending.
 *
 * Single pass with a descending insert into a bounded array: once the array is
 * full the common case is one comparison against the smallest kept value, so
 * this stays ~O(n) over the map rather than the O(n log n) a full sort of a
 * potentially 200k-entry map would cost on the summary-recompute path.
 */
export const topDeadliestTiles = (
  manpowerLossByTileKey: ReadonlyMap<string, number>,
  limit: number = DEADLIEST_TILE_PERSIST_LIMIT
): DeadliestTileEntry[] => {
  if (limit <= 0) return [];
  const top: DeadliestTileEntry[] = [];
  for (const [key, manpowerLost] of manpowerLossByTileKey) {
    if (!(manpowerLost > 0)) continue;
    const smallestKept = top[top.length - 1];
    if (top.length >= limit && smallestKept && manpowerLost <= smallestKept.manpowerLost) continue;
    const coords = parseTileKey(key);
    if (!coords) continue;
    let insertAt = top.length;
    while (insertAt > 0 && top[insertAt - 1]!.manpowerLost < manpowerLost) insertAt -= 1;
    top.splice(insertAt, 0, { x: coords.x, y: coords.y, manpowerLost });
    if (top.length > limit) top.pop();
  }
  return top;
};

/**
 * Restores persisted totals into a live runtime map on boot.
 *
 * Assigns rather than accumulates: the map is expected to be empty (a fresh
 * SimulationRuntime) and re-running this must not double-count, so a repeated
 * seed is idempotent. Entries the caller already has a larger total for win,
 * so a late seed can never walk a live count backwards.
 */
export const seedDeadliestTiles = (
  manpowerLossByTileKey: Map<string, number>,
  entries: readonly DeadliestTileEntry[] | undefined
): void => {
  if (!entries) return;
  for (const entry of entries) {
    if (!Number.isFinite(entry.manpowerLost) || entry.manpowerLost <= 0) continue;
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y)) continue;
    const key = `${entry.x},${entry.y}`;
    const existing = manpowerLossByTileKey.get(key) ?? 0;
    if (entry.manpowerLost > existing) manpowerLossByTileKey.set(key, entry.manpowerLost);
  }
};
