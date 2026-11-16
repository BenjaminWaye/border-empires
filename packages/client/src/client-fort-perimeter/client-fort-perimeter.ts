import { FORT_PERIMETER_BY_VARIANT, WORLD_HEIGHT, WORLD_WIDTH, defendingFortVariant } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Fort perimeter wall, shared by both map renderers
// (client-map-3d-fort-perimeter-wall.ts on true-3D, drawFortPerimeterWall2D
// on the 2D fallback). The rule is packages/shared/src/fort-perimeter: a
// standing fort lends part of its defense to its owner's garrisoned tiles
// within its radius (1 for Palisade/Fort, 2 for the Bastions). The covered
// area -- the fort's own tile plus those garrisoned tiles -- gets a low stone
// wall along its outer edge only, so it reads as a walled-in district and
// never sits on top of whatever is built inside a tile.

/** Covered tile key -> owner id. */
export type FortPerimeterCoverage = ReadonlyMap<string, string>;

type CoverageState = Pick<ClientState, "tiles" | "tilesRevision" | "chunkFullCount">;

const wrapKey = (x: number, y: number): string =>
  `${((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH},${((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT}`;

/** Pure scan of the known tiles; see fortPerimeterCoverage for the memoised entry point. */
export const computeFortPerimeterCoverage = (tiles: ReadonlyMap<string, Tile>, nowMs: number): FortPerimeterCoverage => {
  const coverage = new Map<string, string>();
  for (const tile of tiles.values()) {
    const fort = tile.fort;
    const ownerId = tile.ownerId;
    if (!fort || !ownerId || fort.ownerId !== ownerId || tile.fogged) continue;
    if ((fort.disabledUntil ?? 0) > nowMs) continue;
    const variant = defendingFortVariant(fort);
    if (!variant) continue;
    coverage.set(wrapKey(tile.x, tile.y), ownerId);
    const radius = FORT_PERIMETER_BY_VARIANT[variant].radius;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const key = wrapKey(tile.x + dx, tile.y + dy);
        const covered = tiles.get(key);
        if (covered?.ownerId === ownerId && covered.ownershipState === "SETTLED") coverage.set(key, ownerId);
      }
    }
  }
  return coverage;
};

// One-entry memo: both renderers ask once per frame / rebuild. chunkFullCount
// is in the key because chunk loads write state.tiles without bumping
// tilesRevision (same reason as client-aether-tower-protection.ts).
let coverageMemo: { tiles: ReadonlyMap<string, Tile>; revision: number; chunkCount: number; coverage: FortPerimeterCoverage } | undefined;

export const fortPerimeterCoverage = (state: CoverageState): FortPerimeterCoverage => {
  const memo = coverageMemo;
  if (memo && memo.tiles === state.tiles && memo.revision === state.tilesRevision && memo.chunkCount === state.chunkFullCount) return memo.coverage;
  const coverage = computeFortPerimeterCoverage(state.tiles, Date.now());
  coverageMemo = { tiles: state.tiles, revision: state.tilesRevision, chunkCount: state.chunkFullCount, coverage };
  return coverage;
};

export type FortPerimeterWallEdges = { readonly north: boolean; readonly east: boolean; readonly south: boolean; readonly west: boolean };

/** Sides of a covered tile where the walled area ends, or undefined for a tile outside every perimeter. */
export const fortPerimeterWallEdges = (tile: Pick<Tile, "x" | "y">, coverage: FortPerimeterCoverage): FortPerimeterWallEdges | undefined => {
  const ownerId = coverage.get(wrapKey(tile.x, tile.y));
  if (!ownerId) return undefined;
  const open = (dx: number, dy: number): boolean => coverage.get(wrapKey(tile.x + dx, tile.y + dy)) !== ownerId;
  const edges = { north: open(0, -1), east: open(1, 0), south: open(0, 1), west: open(-1, 0) };
  return edges.north || edges.east || edges.south || edges.west ? edges : undefined;
};

export const FORT_PERIMETER_WALL_COLOR = "#c8bea8";
export const FORT_PERIMETER_WALL_SHADE = "#6f6656";

/**
 * 2D fallback: a stone strip with a dark outer line along each open side,
 * inset inside the tile so it hugs the territory border.
 */
export const drawFortPerimeterWall2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile | undefined,
  coverage: FortPerimeterCoverage | undefined,
  px: number,
  py: number,
  size: number
): void => {
  if (!tile || !coverage) return;
  const edges = fortPerimeterWallEdges(tile, coverage);
  if (!edges) return;
  const width = Math.max(2, Math.round(size * 0.09));
  const shade = Math.max(1, Math.round(width / 3));
  ctx.save();
  ctx.globalAlpha = 0.95;
  const strip = (x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = FORT_PERIMETER_WALL_SHADE;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = FORT_PERIMETER_WALL_COLOR;
    ctx.fillRect(x + shade, y + shade, Math.max(0, w - 2 * shade), Math.max(0, h - 2 * shade));
  };
  if (edges.north) strip(px, py, size, width);
  if (edges.south) strip(px, py + size - width, size, width);
  if (edges.west) strip(px, py, width, size);
  if (edges.east) strip(px + size - width, py, width, size);
  ctx.restore();
};
