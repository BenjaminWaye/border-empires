import type { Terrain } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

/**
 * `clicked` (state.tiles.get(keyFor(wx, wy))) is undefined for a fogged tile
 * discoveredTiles remembers past a reload but never refetched. Persists a
 * terrain-only placeholder into state.tiles (not just returning it to the
 * caller) so later lookups by key -- e.g. the tile-menu tab-click handler
 * re-fetching by currentTileKey -- find it too. Without this, switching tabs
 * on a fogged tile with no prior cache silently no-ops (state.tiles.get
 * returns undefined, so the handler updates activeTab but never re-renders).
 */
export const persistedFoggedTileFallback = (
  state: Pick<ClientState, "tiles">,
  wx: number,
  wy: number,
  clicked: Tile | undefined,
  terrain: Terrain,
  keyFor: (x: number, y: number) => string
): Tile => {
  if (clicked) return clicked;
  const fallbackTile: Tile = { x: wx, y: wy, terrain, fogged: true };
  state.tiles.set(keyFor(wx, wy), fallbackTile);
  return fallbackTile;
};
