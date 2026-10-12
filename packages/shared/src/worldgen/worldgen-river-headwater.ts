// The headwater ring: a river corner whose ring of tiles just outside it
// holds a mountain can be drawn flowing out of that mountain
// (docs/rivers-remake-plan.md, "River mountains"). Shared by the v11+ river start rule
// (worldgen-rivers-edge.ts) and the read-only head lookup the client draws
// river mountains from (worldgen-river-heads.ts). Pure over terrainAt.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { terrainAt } from "./worldgen.js";

// Tiles touching one of corner C's four neighbouring corners but not C itself
// (offsets from C; tile (x, y) spans corners x..x+1, y..y+1).
const HEADWATER_RING: ReadonlyArray<readonly [number, number]> = [
  [-1, -2], [0, -2],
  [1, -1], [1, 0],
  [-1, 1], [0, 1],
  [-2, -1], [-2, 0]
];

export const signedStep = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return Math.sign(d);
};

/**
 * The mountain a river starting at (cx, cy) heading (dx, dy) flows out of:
 * the ring tile furthest behind the river's heading (ties: ring order).
 */
export const headwaterMountainAt = (
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  isMountainAt: (x: number, y: number) => boolean = (x, y) => terrainAt(x, y) === "MOUNTAIN"
): { readonly x: number; readonly y: number } | null => {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const [ox, oy] of HEADWATER_RING) {
    const x = wrapX(cx + ox, WORLD_WIDTH);
    const y = wrapY(cy + oy, WORLD_HEIGHT);
    if (!isMountainAt(x, y)) continue;
    // Tile centre relative to the corner, projected on the heading.
    const score = (ox + 0.5) * dx + (oy + 0.5) * dy;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
};

