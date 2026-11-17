import { FORT_PERIMETER_BY_VARIANT, FORT_TIER_LADDER, WORLD_HEIGHT, WORLD_WIDTH, defendingFortVariant, type FortVariant } from "@border-empires/shared";
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

/** Who covers a tile, and the strongest fort tier whose perimeter (or own fort) covers it -- that tier styles its wall. */
export type FortPerimeterCover = { readonly ownerId: string; readonly variant: FortVariant };

/** Covered tile key -> cover. */
export type FortPerimeterCoverage = ReadonlyMap<string, FortPerimeterCover>;

const tierRank = (variant: FortVariant): number => FORT_TIER_LADDER[variant].defenseMult;

export type FortPerimeterCoverageState = Pick<ClientState, "tiles" | "tilesRevision" | "chunkFullCount" | "dormantStructures">;

const wrapKey = (x: number, y: number): string =>
  `${((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH},${((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT}`;

/** Pure scan of the known tiles; see fortPerimeterCoverage for the memoised entry point. */
/** `dormantKeys` holds the local player's dormant structures ("x,y:fort"): a dormant fort defends nothing, so it gets no wall. */
export const computeFortPerimeterCoverage = (tiles: ReadonlyMap<string, Tile>, nowMs: number, dormantKeys: ReadonlySet<string> = new Set()): FortPerimeterCoverage => {
  const coverage = new Map<string, FortPerimeterCover>();
  const cover = (key: string, ownerId: string, variant: FortVariant): void => {
    const existing = coverage.get(key);
    if (!existing || tierRank(variant) > tierRank(existing.variant)) coverage.set(key, { ownerId, variant });
  };
  for (const tile of tiles.values()) {
    const fort = tile.fort;
    const ownerId = tile.ownerId;
    if (!fort || !ownerId || fort.ownerId !== ownerId || tile.fogged) continue;
    if ((fort.disabledUntil ?? 0) > nowMs || dormantKeys.has(`${tile.x},${tile.y}:fort`)) continue;
    const variant = defendingFortVariant(fort);
    if (!variant) continue;
    cover(wrapKey(tile.x, tile.y), ownerId, variant);
    const radius = FORT_PERIMETER_BY_VARIANT[variant].radius;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const key = wrapKey(tile.x + dx, tile.y + dy);
        const covered = tiles.get(key);
        if (covered?.ownerId === ownerId && covered.ownershipState === "SETTLED") cover(key, ownerId, variant);
      }
    }
  }
  return coverage;
};

// One-entry memo: both renderers ask once per frame / rebuild. chunkFullCount
// is in the key because chunk loads write state.tiles without bumping
// tilesRevision (same reason as client-aether-tower-protection.ts).
let coverageMemo: { tiles: ReadonlyMap<string, Tile>; revision: number; chunkCount: number; dormant: FortPerimeterCoverageState["dormantStructures"]; coverage: FortPerimeterCoverage } | undefined;

export const fortPerimeterCoverage = (state: FortPerimeterCoverageState): FortPerimeterCoverage => {
  const memo = coverageMemo;
  if (
    memo &&
    memo.tiles === state.tiles &&
    memo.revision === state.tilesRevision &&
    memo.chunkCount === state.chunkFullCount &&
    memo.dormant === state.dormantStructures
  ) {
    return memo.coverage;
  }
  const dormantKeys = new Set(state.dormantStructures.map((entry) => entry.key));
  const coverage = computeFortPerimeterCoverage(state.tiles, Date.now(), dormantKeys);
  coverageMemo = { tiles: state.tiles, revision: state.tilesRevision, chunkCount: state.chunkFullCount, dormant: state.dormantStructures, coverage };
  return coverage;
};

export type FortPerimeterWallEdges = {
  readonly north: boolean;
  readonly east: boolean;
  readonly south: boolean;
  readonly west: boolean;
  /** Tier that styles this tile's wall segments. */
  readonly variant: FortVariant;
};

/** Sides of a covered tile where the walled area ends, or undefined for a tile outside every perimeter. */
export const fortPerimeterWallEdges = (tile: Pick<Tile, "x" | "y">, coverage: FortPerimeterCoverage): FortPerimeterWallEdges | undefined => {
  const here = coverage.get(wrapKey(tile.x, tile.y));
  if (!here) return undefined;
  const open = (dx: number, dy: number): boolean => coverage.get(wrapKey(tile.x + dx, tile.y + dy))?.ownerId !== here.ownerId;
  const edges = { north: open(0, -1), east: open(1, 0), south: open(0, 1), west: open(-1, 0), variant: here.variant };
  return edges.north || edges.east || edges.south || edges.west ? edges : undefined;
};

/**
 * Per-tier wall look, matched to that tier's fort model
 * (client-map-3d-fort-overlay.ts colours): a low wooden fence for the
 * Palisade, a stone wall for the Fort, a taller titanium wall for the
 * Titanium Bastion and the tallest dark-metal wall for the Thunder Bastion.
 * Sizes are in tiles; the 2D renderer scales `thickness` by the tile size.
 */
export type FortPerimeterWallStyle = {
  readonly color: string;
  readonly shade: string;
  readonly height: number;
  readonly thickness: number;
  readonly metalness: number;
  readonly roughness: number;
  /** Fence posts (Palisade) or battlements (stone and metal walls) along the top. */
  readonly topping: "posts" | "merlons";
};

export const FORT_PERIMETER_WALL_STYLES: Record<FortVariant, FortPerimeterWallStyle> = {
  PALISADE: { color: "#8a6a47", shade: "#4f3a24", height: 0.06, thickness: 0.05, metalness: 0, roughness: 0.9, topping: "posts" },
  FORT: { color: "#aea99c", shade: "#5f5a4e", height: 0.08, thickness: 0.07, metalness: 0, roughness: 0.92, topping: "merlons" },
  TITANIUM_BASTION: { color: "#9aa7b3", shade: "#4a5560", height: 0.1, thickness: 0.08, metalness: 0.7, roughness: 0.45, topping: "merlons" },
  THUNDER_BASTION: { color: "#4e5864", shade: "#20262d", height: 0.12, thickness: 0.09, metalness: 0.8, roughness: 0.4, topping: "merlons" }
};

/**
 * 2D fallback: a strip in the tier's wall colour with a darker outline along
 * each open side, inset inside the tile so it hugs the territory border;
 * wider for stronger tiers, dashed into posts for the Palisade.
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
  const style = FORT_PERIMETER_WALL_STYLES[edges.variant];
  const width = Math.max(2, Math.round(size * style.thickness * 1.3));
  const shade = Math.max(1, Math.round(width / 3));
  ctx.save();
  ctx.globalAlpha = 0.95;
  const strip = (x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = style.shade;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = style.color;
    if (style.topping === "posts") {
      // Palisade: separate stakes instead of a solid wall.
      const horizontal = w >= h;
      const length = horizontal ? w : h;
      const step = Math.max(3, length / 6);
      for (let at = 0; at < length; at += step) {
        const len = Math.max(1, step - shade);
        if (horizontal) ctx.fillRect(x + at, y + shade, len, Math.max(0, h - 2 * shade));
        else ctx.fillRect(x + shade, y + at, Math.max(0, w - 2 * shade), len);
      }
      return;
    }
    ctx.fillRect(x + shade, y + shade, Math.max(0, w - 2 * shade), Math.max(0, h - 2 * shade));
  };
  if (edges.north) strip(px, py, size, width);
  if (edges.south) strip(px, py + size - width, size, width);
  if (edges.west) strip(px, py, width, size);
  if (edges.east) strip(px + size - width, py, width, size);
  ctx.restore();
};
