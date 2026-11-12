import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";

/**
 * The tile as it stands now. A landing's TILE_DELTA_BATCH is built from
 * copies taken before the AFC tile was written, but that write runs the
 * reach auto-claim synchronously (claiming the cleared tiles as FRONTIER and
 * emitting its own batch first). Sending the stale, unowned copy after it
 * would tell the client those tiles are unowned again -- a hole in the
 * starting territory -- so the batch re-reads each tile from live state.
 */
export const liveTile = (ctx: { tiles: ReadonlyMap<string, DomainTileState> }, tile: DomainTileState): DomainTileState =>
  ctx.tiles.get(simulationTileKey(tile.x, tile.y)) ?? tile;
