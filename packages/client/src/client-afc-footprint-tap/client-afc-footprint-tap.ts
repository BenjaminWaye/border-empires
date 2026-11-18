import { landmarkSuperTileAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
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

/** Signed shortest offset from `from` to `to` on a wrapping axis of `size`. */
const wrappedDelta = (from: number, to: number, size: number): number => {
  const raw = ((to - from) % size + size) % size;
  return raw > size / 2 ? raw - size : raw;
};

/**
 * Module socket (0-based) whose arm reaches the footprint tile (x, y) of the
 * AFC at `centre`. Matches the 3D socket ring (client-map-3d-fabrication-
 * complex.ts: socket k sits at azimuth k·45°, scene z = world y) and the
 * Modules tab diagram: socket 0 east, then clockwise -- SE, S, SW, W, NW, N, NE.
 */
export const afcArmSocketForTile = (centre: Pick<Tile, "x" | "y">, x: number, y: number): number | undefined => {
  const dx = wrappedDelta(centre.x, x, WORLD_WIDTH);
  const dy = wrappedDelta(centre.y, y, WORLD_HEIGHT);
  if ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return undefined;
  const socket = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return (socket + 8) % 8;
};

/** Menu options for a tap that `ownAfcFootprintTapTarget` routed from (x, y) to the AFC at `target`. */
export const afcArmTapMenuOptions = (target: Pick<Tile, "x" | "y" | "afc">, x: number, y: number): { afcArmSocket: number } | undefined => {
  if (!target.afc) return undefined;
  const afcArmSocket = afcArmSocketForTile(target, x, y);
  return afcArmSocket === undefined ? undefined : { afcArmSocket };
};
