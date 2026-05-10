import type { Tile } from "./client-types.js";

export type EdgeDirection = "north" | "east" | "south" | "west";

export type WeakDefensibilitySeverity = "warning" | "critical";

export type ExposedSidesArgs = {
  tiles: Map<string, Tile>;
  me: string;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
};

// Single source of truth for "this tile is fully under my control as a
// defensible land hex". Used by the 2D + 3D weak-defensibility overlays
// and the panel breakdown to gate which tiles count toward the score and
// which qualify as a same-empire neighbour for an exposed-side check.
// Type guard so `Tile | undefined` narrows to `Tile` at the call site.
export const isOwnedSettledLandTile = (tile: Tile | undefined, me: string): tile is Tile =>
  !!tile && tile.ownerId === me && tile.terrain === "LAND" && tile.ownershipState === "SETTLED" && !tile.fogged;

// Hoisted to module scope: the per-tile rebuild loop in
// client-map-3d.ts and client-runtime-loop.ts can call this thousands of
// times per frame, and a per-call `[{...}, {...}, {...}, {...}]` literal
// would dominate allocation pressure on the rebuild hot path.
const NEIGHBOR_DIRECTIONS: ReadonlyArray<{ readonly name: EdgeDirection; readonly dx: number; readonly dy: number }> = [
  { name: "north", dx: 0, dy: -1 },
  { name: "east", dx: 1, dy: 0 },
  { name: "south", dx: 0, dy: 1 },
  { name: "west", dx: -1, dy: 0 }
];

export const exposedSidesForTile = (tile: Tile, args: ExposedSidesArgs): EdgeDirection[] => {
  const out: EdgeDirection[] = [];
  for (const dir of NEIGHBOR_DIRECTIONS) {
    const nx = tile.x + dir.dx;
    const ny = tile.y + dir.dy;
    const neighbor = args.tiles.get(args.keyFor(args.wrapX(nx), args.wrapY(ny)));
    if (isOwnedSettledLandTile(neighbor, args.me)) continue;
    const terrain = args.terrainAt(nx, ny);
    if (terrain === "SEA" || terrain === "COASTAL_SEA" || terrain === "MOUNTAIN") continue;
    out.push(dir.name);
  }
  return out;
};

// Single source of truth for the "should this tile be highlighted, and how?"
// classification. 2 exposed sides → warning (orange); 3+ → critical (red);
// fewer → not highlighted at all. Keeps the 2D and 3D weak-tile renderers
// in lockstep so a future threshold change touches one place.
export const weakDefensibilitySeverity = (exposedSideCount: number): WeakDefensibilitySeverity | null => {
  if (exposedSideCount >= 3) return "critical";
  if (exposedSideCount >= 2) return "warning";
  return null;
};
