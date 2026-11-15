import { isSeaTerrain } from "@border-empires/shared";

import { reachEmphasisStyle } from "../client-reach-border-emphasis/client-reach-border-emphasis.js";
import type { IncursionDeps, IncursionEdges, IncursionTile } from "./client-reach-incursion.js";

// 2D canvas twin of the 3D rival reach pylons (client-reach-overlay-3d-multi.ts):
// a thin line in a rival's colour along the edge of its reach. The 2D map
// only drew your own reach line, so a neighbouring empire whose land was out
// of sight showed nothing but an "Inside <name> Reach" label on your tile
// (playtest 2026-11-13, pt-strategist). Like the 3D path it reads each tile's
// server-resolved reachOwnerId, skips barbarians and water, and is drawn only
// on visible tiles.

const isWater = (tile: IncursionTile): boolean => tile.terrain !== undefined && isSeaTerrain(tile.terrain);

/** Same owner test as computeReachSetsByOwnerFromWire + filterReachToLand. */
const rivalReachOwner = (tile: IncursionTile | undefined, me: string): string | undefined => {
  const owner = tile?.reachOwnerId;
  if (!owner || owner === me || owner.startsWith("barbarian-")) return undefined;
  return tile && isWater(tile) ? undefined : owner;
};

/** Sides of this tile on a rival's reach edge, or undefined when it isn't inside a rival's reach. */
export const rivalReachEdges = (tile: IncursionTile, wx: number, wy: number, me: string, deps: IncursionDeps): { ownerId: string; edges: IncursionEdges } | undefined => {
  const ownerId = rivalReachOwner(tile, me);
  if (!ownerId) return undefined;
  // An unloaded neighbour counts as outside, as in the 3D trace (its set comes from loaded tiles only).
  const outside = (x: number, y: number): boolean => {
    const neighbour = deps.tiles.get(deps.keyFor(deps.wrapX(x), deps.wrapY(y)));
    return neighbour?.reachOwnerId !== ownerId || (neighbour !== undefined && isWater(neighbour));
  };
  const edges = { north: outside(wx, wy - 1), east: outside(wx + 1, wy), south: outside(wx, wy + 1), west: outside(wx - 1, wy) };
  return edges.north || edges.east || edges.south || edges.west ? { ownerId, edges } : undefined;
};

/** Strokes the rival reach edges of one visible tile, de-emphasised like the 3D rival pylons. */
export const drawRivalReachLine2D = (
  ctx: CanvasRenderingContext2D,
  edges: IncursionEdges,
  color: string,
  px: number,
  py: number,
  size: number
): void => {
  const style = reachEmphasisStyle("rival");
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 1;
  const y2 = py + size - 1;
  ctx.save();
  ctx.beginPath();
  if (edges.north) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); }
  if (edges.east) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); }
  if (edges.south) { ctx.moveTo(x2, y2); ctx.lineTo(x1, y2); }
  if (edges.west) { ctx.moveTo(x1, y2); ctx.lineTo(x1, y1); }
  ctx.lineCap = "round";
  ctx.globalAlpha = style.opacityMult;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.14 * style.lineRadiusScale);
  ctx.stroke();
  ctx.restore();
};
