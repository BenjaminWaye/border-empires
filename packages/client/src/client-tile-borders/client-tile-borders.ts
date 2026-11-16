import type { Tile, TileVisibilityState } from "../client-types.js";
import { clampOwnershipBorderWidth } from "../client-ownership-borders/client-ownership-borders.js";
import { drawBreachTornBorder } from "../client-breach-border/client-breach-border.js";

type TileMap = Map<string, Tile>;

export type BorderSideDeps = {
  tiles: TileMap;
  keyFor: (x: number, y: number) => string;
  wrapX: (value: number) => number;
  wrapY: (value: number) => number;
};

export type ExposedBorderSides = { top: boolean; right: boolean; bottom: boolean; left: boolean };

const sharesBorderTerritory = (tile: Tile, neighbor?: Tile): boolean => {
  if (!neighbor || neighbor.fogged || neighbor.ownerId !== tile.ownerId) return false;
  return neighbor.ownershipState === tile.ownershipState;
};

// A side is "exposed" when the neighbour on that side isn't the same
// owner+ownershipState as this tile — i.e. a friendly tile is missing there
// (enemy-owned, unowned, or fogged). Shared by the plain ownership border
// and the Breakthrough Momentum breach overlay so the two stay in lockstep:
// whichever side loses its solid line to a torn edge is exactly the side
// that was exposed by the capture.
export const exposedBorderSides = (tile: Tile, deps: BorderSideDeps): ExposedBorderSides => {
  const top = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y - 1)));
  const right = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + 1), deps.wrapY(tile.y)));
  const bottom = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y + 1)));
  const left = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x - 1), deps.wrapY(tile.y)));
  return {
    top: !sharesBorderTerritory(tile, top),
    right: !sharesBorderTerritory(tile, right),
    bottom: !sharesBorderTerritory(tile, bottom),
    left: !sharesBorderTerritory(tile, left)
  };
};

export const drawExposedTileBorder = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
  deps: BorderSideDeps,
  omit?: Partial<ExposedBorderSides>
): void => {
  const sides = exposedBorderSides(tile, deps);
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  ctx.beginPath();
  if (sides.top && !omit?.top) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
  }
  if (sides.right && !omit?.right) {
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
  }
  if (sides.bottom && !omit?.bottom) {
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y2);
  }
  if (sides.left && !omit?.left) {
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
};

export type TileBorderRenderDeps = BorderSideDeps & {
  ctx: CanvasRenderingContext2D;
  me: string;
  is3D: boolean;
  shouldDrawOwnershipBorder: (tile: Tile) => boolean;
  borderColorForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => string;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  borderLineWidthForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => number;
};

// Single source of truth for the "solid ownership border + torn breach edge"
// tile decoration, shared by both copies of the render loop (main pass and
// the cached/fog-of-war pass) so the two stay in lockstep instead of drifting.
export const drawTileOwnershipAndBreachBorder = (
  tile: Tile | undefined,
  vis: TileVisibilityState,
  px: number,
  py: number,
  size: number,
  deps: TileBorderRenderDeps
): void => {
  const breached = !!(tile && vis === "visible" && typeof tile.breachShockUntil === "number" && tile.breachShockUntil > Date.now() && tile.ownerId);
  const breachSides = breached ? exposedBorderSides(tile!, deps) : undefined;

  if (!deps.is3D && tile && vis === "visible" && deps.shouldDrawOwnershipBorder(tile)) {
    const ownerId = tile.ownerId!;
    deps.ctx.strokeStyle =
      ownerId === "barbarian"
        ? "rgba(214, 222, 232, 0.45)"
        : ownerId === deps.me
          ? deps.borderColorForOwner(ownerId, tile.ownershipState)
          : deps.isTileOwnedByAlly(tile)
            ? "rgba(255, 205, 92, 0.82)"
            : deps.borderColorForOwner(ownerId, tile.ownershipState);
    deps.ctx.lineWidth = clampOwnershipBorderWidth(deps.borderLineWidthForOwner(ownerId, tile.ownershipState), size);
    deps.ctx.lineDashOffset = 0;
    deps.ctx.setLineDash([]);
    drawExposedTileBorder(deps.ctx, tile, px, py, size, deps, breachSides);
    deps.ctx.setLineDash([]);
    deps.ctx.lineDashOffset = 0;
    deps.ctx.lineWidth = 1;
  } else if (!deps.is3D && tile && vis === "visible" && isOutlinedFrontierTile(tile)) {
    drawFrontierTerritoryEdge(deps.ctx, tile, px, py, size, deps);
  }

  if (breached && breachSides) {
    drawBreachTornBorder(deps.ctx, tile!, px, py, size, breachSides);
  }
};

const isOutlinedFrontierTile = (tile: Tile): boolean =>
  tile.ownershipState === "FRONTIER" && !!tile.ownerId && !tile.ownerId.startsWith("barbarian");

/** Sides where a frontier tile meets land that isn't the same owner's (any ownership state), or unknown/fogged ground. */
export const frontierTerritoryEdgeSides = (tile: Tile, deps: BorderSideDeps): ExposedBorderSides => {
  const otherOwner = (dx: number, dy: number): boolean => {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy)));
    return !neighbor || !!neighbor.fogged || neighbor.ownerId !== tile.ownerId;
  };
  return { top: otherOwner(0, -1), right: otherOwner(1, 0), bottom: otherOwner(0, 1), left: otherOwner(-1, 0) };
};

// Ungarrisoned (FRONTIER) land had no outline at all on the 2D map -- only a
// faint owner-hue fill -- so owned and unclaimed land were hard to tell apart
// without colour vision (playtest). Outline the territory's outer edge with a
// dark underlay and a light dash on top: the contrast is in luminance and
// pattern, not hue, and it stays thinner than the solid garrisoned border.
const drawFrontierTerritoryEdge = (ctx: CanvasRenderingContext2D, tile: Tile, px: number, py: number, size: number, deps: BorderSideDeps): void => {
  const sides = frontierTerritoryEdgeSides(tile, deps);
  if (!sides.top && !sides.right && !sides.bottom && !sides.left) return;
  const width = clampOwnershipBorderWidth(1.5, size);
  const dash = Math.max(2, size * 0.18);
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  const tracePath = (): void => {
    ctx.beginPath();
    if (sides.top) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); }
    if (sides.right) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); }
    if (sides.bottom) { ctx.moveTo(x2, y2); ctx.lineTo(x1, y2); }
    if (sides.left) { ctx.moveTo(x1, y2); ctx.lineTo(x1, y1); }
  };
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = width + 1;
  ctx.strokeStyle = "rgba(8, 12, 20, 0.55)";
  tracePath();
  ctx.stroke();
  ctx.setLineDash([dash, dash]);
  ctx.lineDashOffset = 0;
  ctx.lineWidth = width;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  tracePath();
  ctx.stroke();
  ctx.restore();
};
