// River mountains (docs/river-mountains-plan.md, PR C): a mountain one tile
// ring out from a river's head is drawn with the river falling out of it --
// a cleft in the face that turns toward the river, and a cascade from the
// cleft down to the spring pool. Shared by both renderers so they agree on
// which mountains carry a cascade and which way it runs.
//
// Purely visual: the tile stays MOUNTAIN for gameplay. The river paths say
// where the head is (riverHeadsForCurrentSeed, static worldgen terrain); the
// caller passes the live mountain check, so a mountain removed at runtime
// (AFC join-drop footprint) loses its cascade and the head is a plain spring.
import { riverEdgeKeyBetween, riverHeadsForCurrentSeed, WORLD_HEIGHT, WORLD_WIDTH, type RiverHead } from "@border-empires/shared";

export type RiverMountainFace = {
  readonly mountain: { readonly x: number; readonly y: number };
  /** The river's head corner (world corner coords), where the spring pool is. */
  readonly head: { readonly x: number; readonly y: number };
  /** The mountain's corner one tile edge from the head: the cascade leaves the mountain here. */
  readonly exit: { readonly x: number; readonly y: number };
  /** Unit direction (world x/y) from the mountain tile's centre toward `exit`. */
  readonly dirX: number;
  readonly dirY: number;
};

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
const toroid = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

/** The face a head's mountain shows the river, or null when the head has no mountain. */
export const riverMountainFaceOf = (head: RiverHead): RiverMountainFace | null => {
  const m = head.mountain;
  if (!m) return null;
  // The mountain's four corners, relative to the head; the nearest is one edge away.
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const dx = toroid(head.corner.x, m.x + ox, WORLD_WIDTH);
    const dy = toroid(head.corner.y, m.y + oy, WORLD_HEIGHT);
    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: dx, y: dy };
    }
  }
  if (!best || bestDistance !== 1) return null;
  // Exit and mountain centre relative to the head.
  const centreX = toroid(head.corner.x, m.x, WORLD_WIDTH) + 0.5;
  const centreY = toroid(head.corner.y, m.y, WORLD_HEIGHT) + 0.5;
  const len = Math.hypot(best.x - centreX, best.y - centreY) || 1;
  return {
    mountain: m,
    head: head.corner,
    exit: { x: wrapX(head.corner.x + best.x), y: wrapY(head.corner.y + best.y) },
    dirX: (best.x - centreX) / len,
    dirY: (best.y - centreY) / len
  };
};

// One seed's worth (at most one entry per river), rebuilt when the memoized
// heads map changes identity (seed or worldgen version change).
let cachedHeads: ReadonlyMap<number, RiverHead> | undefined;
let cachedByMountain: ReadonlyMap<number, RiverMountainFace> = new Map();
let cachedCascadeEdges: ReadonlySet<number> = new Set();

const ensureCache = (heads: ReadonlyMap<number, RiverHead>): void => {
  if (heads === cachedHeads) return;
  cachedHeads = heads;
  const byMountain = new Map<number, RiverMountainFace>();
  const edges = new Set<number>();
  for (const head of heads.values()) {
    const face = riverMountainFaceOf(head);
    if (!face) continue;
    const key = face.mountain.y * WORLD_WIDTH + face.mountain.x;
    if (byMountain.has(key)) continue; // one cascade per mountain
    byMountain.set(key, face);
    edges.add(riverEdgeKeyBetween(face.exit.x, face.exit.y, face.head.x, face.head.y));
  }
  cachedByMountain = byMountain;
  cachedCascadeEdges = edges;
};

/** Every river mountain face for the current seed, keyed by mountain tile index (y * WORLD_WIDTH + x). */
export const riverMountainFaces = (heads: ReadonlyMap<number, RiverHead> = riverHeadsForCurrentSeed()): ReadonlyMap<number, RiverMountainFace> => {
  ensureCache(heads);
  return cachedByMountain;
};

/** The river face of mountain tile (wx, wy), if it still is a mountain (`isMountainAt`, live terrain). */
export const riverMountainFaceAt = (
  wx: number,
  wy: number,
  isMountainAt: (x: number, y: number) => boolean,
  heads: ReadonlyMap<number, RiverHead> = riverHeadsForCurrentSeed()
): RiverMountainFace | null => {
  if (heads.size === 0) return null;
  const face = riverMountainFaces(heads).get(wrapY(wy) * WORLD_WIDTH + wrapX(wx));
  return face && isMountainAt(face.mountain.x, face.mountain.y) ? face : null;
};

/** Tile edges (riverEdgeKey format) the cascades run along, from a mountain's exit corner to the river head. */
export const riverCascadeEdges = (heads: ReadonlyMap<number, RiverHead> = riverHeadsForCurrentSeed()): ReadonlySet<number> => {
  ensureCache(heads);
  return cachedCascadeEdges;
};
