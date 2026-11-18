import { landmarkSuperTileAt } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/**
 * A tap on one of the support tiles around the viewer's own AFC opens the AFC
 * itself (its details and modules) rather than the bare plains tile under the
 * arm. Returns the AFC centre tile, or undefined when (x, y) is not a footprint
 * member of an AFC the viewer owns. Enemy/neutral footprints keep their own
 * tile so frontier claims and attacks still target the tapped tile.
 */
export const ownAfcFootprintTapTarget = (
  tiles: { get(key: string): Tile | undefined },
  me: string | undefined,
  x: number,
  y: number
): Tile | undefined => {
  if (!me) return undefined;
  const superTile = landmarkSuperTileAt(tiles, x, y);
  const centre = superTile?.centre;
  if (!centre?.afc || centre.fogged) return undefined;
  if (centre.x === x && centre.y === y) return undefined;
  return centre.ownerId === me ? centre : undefined;
};
