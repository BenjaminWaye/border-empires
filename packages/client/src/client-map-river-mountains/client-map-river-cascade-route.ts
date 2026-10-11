// Where a river mountain's cascade runs in 3D (client-map-3d-river-cascade.ts),
// worked out from the face alone so the tree placement can keep clear of it
// (client-map-3d-river-bank-trees.ts): a fall down the mountain's face toward
// its exit corner -- turned toward the camera when that corner is on the far
// (north) side, which the camera can't see -- landing at a foot point, then a
// stream over the ground from the foot to the spring pool at the river head.
import { riverHeadsForCurrentSeed, WORLD_HEIGHT, WORLD_WIDTH, type RiverHead } from "@border-empires/shared";
import { riverMountainFaces, type RiverMountainFace } from "./client-map-river-mountains.js";

// The fall lands this far out from the mountain tile's centre (tiles): about
// where the widened mountain model meets the ground.
export const CASCADE_FOOT_RHO = 0.78;
// A north exit corner: the fall turns this far south (per unit east/west) so
// it comes down a face the camera sees.
const BEHIND_TURN_SOUTH = 1.4;
// Trees keep this far back from the stream's centreline.
const STREAM_TREE_CLEARANCE = 0.32;

export type CascadeRoute = {
  /** Unit direction (world x/y) the water falls in, from the mountain tile's centre. */
  readonly dirX: number;
  readonly dirY: number;
  /** Foot of the fall, and the river head it streams to, in world tile units (unwrapped, near the mountain). */
  readonly footX: number;
  readonly footY: number;
  readonly headX: number;
  readonly headY: number;
};

const toroid = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

export const cascadeRoute = (face: RiverMountainFace): CascadeRoute => {
  const centreX = face.mountain.x + 0.5;
  const centreY = face.mountain.y + 0.5;
  const exitX = centreX + toroid(centreX, face.exit.x, WORLD_WIDTH);
  const exitY = centreY + toroid(centreY, face.exit.y, WORLD_HEIGHT);
  const aimX = exitX - centreX;
  const aimY = exitY < centreY ? BEHIND_TURN_SOUTH * Math.abs(aimX) : exitY - centreY;
  const len = Math.hypot(aimX, aimY) || 1;
  const dirX = aimX / len;
  const dirY = aimY / len;
  return {
    dirX,
    dirY,
    footX: centreX + dirX * CASCADE_FOOT_RHO,
    footY: centreY + dirY * CASCADE_FOOT_RHO,
    headX: centreX + toroid(centreX, face.head.x, WORLD_WIDTH),
    headY: centreY + toroid(centreY, face.head.y, WORLD_HEIGHT)
  };
};

const wrapW = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapH = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

// Per seed: every stream, and the tiles near one (tile index -> its streams).
let cachedHeads: ReadonlyMap<number, RiverHead> | undefined;
let cachedNear: ReadonlyMap<number, readonly CascadeRoute[]> = new Map();

const nearTiles = (heads: ReadonlyMap<number, RiverHead>): ReadonlyMap<number, readonly CascadeRoute[]> => {
  if (heads === cachedHeads) return cachedNear;
  cachedHeads = heads;
  const near = new Map<number, CascadeRoute[]>();
  for (const face of riverMountainFaces(heads).values()) {
    const route = cascadeRoute(face);
    const tiles = new Set<number>();
    for (let t = 0; t <= 1; t += 0.1) {
      const x = Math.floor(route.footX + (route.headX - route.footX) * t);
      const y = Math.floor(route.footY + (route.headY - route.footY) * t);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) tiles.add(wrapH(y + dy) * WORLD_WIDTH + wrapW(x + dx));
    }
    for (const key of tiles) near.set(key, [...(near.get(key) ?? []), route]);
  }
  cachedNear = near;
  return near;
};

const distanceToSegment = (px: number, py: number, r: CascadeRoute): number => {
  const vx = r.headX - r.footX;
  const vy = r.headY - r.footY;
  const t = Math.max(0, Math.min(1, ((px - r.footX) * vx + (py - r.footY) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (r.footX + vx * t), py - (r.footY + vy * t));
};

/**
 * For tile (worldX, worldY): true when a tree at offset (ox, oy) from the
 * tile's centre stands on a cascade's stream; null when no stream is near.
 */
export const cascadeStreamTreeFilter = (
  worldX: number,
  worldY: number,
  heads: ReadonlyMap<number, RiverHead> = riverHeadsForCurrentSeed()
): ((ox: number, oy: number) => boolean) | null => {
  if (heads.size === 0) return null;
  const routes = nearTiles(heads).get(wrapH(worldY) * WORLD_WIDTH + wrapW(worldX));
  if (!routes) return null;
  return (ox, oy) =>
    routes.some((r) => {
      // The tree, unwrapped to sit near this route.
      const px = r.footX + toroid(r.footX, worldX + 0.5 + ox, WORLD_WIDTH);
      const py = r.footY + toroid(r.footY, worldY + 0.5 + oy, WORLD_HEIGHT);
      return distanceToSegment(px, py, r) < STREAM_TREE_CLEARANCE;
    });
};
