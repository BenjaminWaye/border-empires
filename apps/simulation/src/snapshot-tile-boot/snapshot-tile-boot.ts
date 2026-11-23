import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { withAfcFortFacts } from "../afc-specializations/afc-fort-facts.js";
import { mapTile, type SnapshotTile } from "../runtime-snapshot-sections.js";

const tileKey = (x: number, y: number): string => `${x},${y}`;

/** True when `recovered` holds exactly the fields `mapped` does, with identical values. */
const sameSnapshotTile = (recovered: SnapshotTile, mapped: SnapshotTile): boolean => {
  const recoveredFields = recovered as Record<string, unknown>;
  const mappedFields = mapped as Record<string, unknown>;
  let mappedCount = 0;
  for (const field in mappedFields) {
    if (recoveredFields[field] !== mappedFields[field]) return false;
    mappedCount += 1;
  }
  let recoveredCount = 0;
  for (const _field in recoveredFields) recoveredCount += 1;
  return recoveredCount === mappedCount;
};

/**
 * The snapshot-shaped copy of `tile` for the runtime's snapshot tile cache:
 * the recovered tile object itself when it already says exactly what
 * `mapTile(tile)` would, a fresh `mapTile(tile)` otherwise.
 *
 * The runtime is booted from recovered tiles that stay alive for the life of
 * the process anyway (the worldgen baseline the checkpoint compaction diffs
 * against, and the startup recovery state). A tile nobody has touched since
 * is field-for-field the same in both, so copying it again cost one extra
 * object per tile of the world for nothing: ~43 MB on a 204,800-tile world
 * (docs/load-results/sector-memory-2026-11-23.md). Snapshot cache entries are
 * replaced on write, never mutated, so sharing the object is safe; substructures
 * are compared by reference, so anything hydration rebuilt gets a fresh copy.
 */
export const snapshotTileSharingRecovered = (tile: DomainTileState, recovered: SnapshotTile | undefined): SnapshotTile => {
  const mapped = mapTile(tile);
  return recovered !== undefined && sameSnapshotTile(recovered, mapped) ? recovered : mapped;
};

/**
 * Boot step: stamps AFC fort facts onto every tile and fills the snapshot tile
 * cache, reusing recovered tile objects where they are already identical.
 * Returns how many entries were shared, for the boot log.
 */
export const bootSnapshotTileCache = (input: {
  tiles: Map<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  snapshotTileCache: Map<string, SnapshotTile>;
  recoveredTiles: ReadonlyArray<SnapshotTile> | undefined;
}): { tiles: number; sharedWithRecovered: number } => {
  const recoveredByKey = new Map<string, SnapshotTile>();
  for (const recovered of input.recoveredTiles ?? []) recoveredByKey.set(tileKey(recovered.x, recovered.y), recovered);
  let sharedWithRecovered = 0;
  for (const [key, sourceTile] of input.tiles) {
    const tile = withAfcFortFacts(sourceTile, input.players);
    input.tiles.set(key, tile);
    const recovered = recoveredByKey.get(key);
    const snapshotTile = snapshotTileSharingRecovered(tile, recovered);
    if (snapshotTile === recovered) sharedWithRecovered += 1;
    input.snapshotTileCache.set(key, snapshotTile);
  }
  return { tiles: input.tiles.size, sharedWithRecovered };
};
