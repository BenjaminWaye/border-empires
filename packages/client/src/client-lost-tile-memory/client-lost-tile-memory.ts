// Who took the land you lost, painted into your fog on login. Explored tiles you can't see arrive with no
// data, so land lost far from your remaining territory showed as unowned fog even though the Chronicle said
// who took it (Playtest Run 4). The SubscribePlayer reply carries `lostTiles` (apps/simulation
// lost-tile-memory.ts): the House that took each tile from you in the last 24h, never a later change of hands.
// Each becomes a fogged tile of that owner unless the client already has data for it; both renderers draw
// remembered ownership under fog, and the tile sheet names the owner. Bounded by the server's cap (500).
import type { Tile } from "../client-types.js";

export type LostTileMemoryState = {
  tiles: Map<string, Tile>;
  discoveredTiles: Set<string>;
  tilesRevision: number;
};

type LostTile = { x: number; y: number; ownerId: string };

const LOST_TILE_MEMORY_MAX = 500;

const parseLostTiles = (value: unknown): LostTile[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is LostTile =>
          Boolean(entry) && typeof entry === "object" &&
          Number.isInteger((entry as LostTile).x) && Number.isInteger((entry as LostTile).y) &&
          typeof (entry as LostTile).ownerId === "string" && (entry as LostTile).ownerId.length > 0)
        .slice(0, LOST_TILE_MEMORY_MAX)
    : [];

/** Paints each lost tile the client has no ownership data for as fogged land of whoever took it. Returns how many. */
export const applyLostTileMemory = (state: LostTileMemoryState, raw: unknown): number => {
  let painted = 0;
  for (const lost of parseLostTiles(raw)) {
    const key = `${lost.x},${lost.y}`;
    const existing = state.tiles.get(key);
    // Live data wins: a tile in sight, or one remembered with an owner, already says who holds it.
    if (existing && (!existing.fogged || existing.ownerId)) continue;
    state.tiles.set(key, { ...(existing ?? { x: lost.x, y: lost.y, terrain: "LAND" }), ownerId: lost.ownerId, ownershipState: existing?.ownershipState ?? "FRONTIER", fogged: true });
    state.discoveredTiles.add(key);
    painted += 1;
  }
  if (painted > 0) state.tilesRevision += 1;
  return painted;
};
