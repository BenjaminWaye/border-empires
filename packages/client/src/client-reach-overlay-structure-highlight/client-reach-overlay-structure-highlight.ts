import type { ReachAnchorKind } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { tileKeysAroundAnchor, type LocalAnchor } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";

// On-demand reach visualization: while a reach-projecting structure (town,
// dock, or outpost-family: RELAY_BEACON/SIEGE_OUTPOST/SIEGE_TOWER/
// DREAD_TOWER) tile is selected (state.selected — set by
// client-action-flow.ts's handleTileSelection), green-tint every tile its
// reach disk covers, so the player can see at a glance what one specific
// building projects onto, distinct from the aggregate player-wide border
// (client-reach-overlay.ts's myReach boundary).

const HIGHLIGHT_FILL_STYLE = "rgba(70, 220, 100, 0.28)";

/**
 * Which ReachAnchorKind (if any) the tile's structure projects reach as,
 * mirroring packages/shared/src/reach/reach.ts's anchor construction from
 * towns/outposts/docks. Undefined for a tile with no reach-projecting
 * structure.
 */
export const reachAnchorKindForTile = (tile: Tile): ReachAnchorKind | undefined => {
  if (tile.dock || tile.dockId) return "DOCK";
  if (tile.siegeOutpost) return "OUTPOST";
  if (tile.economicStructure?.type === "RELAY_BEACON") return "OUTPOST";
  if (tile.townType || tile.town) return "TOWN";
  return undefined;
};

export type StructureReachHighlightDeps = {
  ctx: CanvasRenderingContext2D;
  keyFor: (x: number, y: number) => string;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

export const renderSelectedStructureReachHighlight = (
  state: ClientState,
  deps: StructureReachHighlightDeps,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const selected = state.selected;
  if (!selected) return;
  const tile = state.tiles.get(deps.keyFor(selected.x, selected.y));
  if (!tile) return;
  if (deps.tileVisibilityStateAt(selected.x, selected.y, tile) !== "visible") return;
  const kind = reachAnchorKindForTile(tile);
  if (!kind) return;
  const anchor: LocalAnchor = { x: selected.x, y: selected.y, kind };
  for (const key of tileKeysAroundAnchor(anchor)) {
    const [xRaw, yRaw] = key.split(",");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { sx, sy } = deps.worldToScreen(x, y, size, halfW, halfH);
    deps.ctx.save();
    deps.ctx.fillStyle = HIGHLIGHT_FILL_STYLE;
    deps.ctx.fillRect(sx - size / 2 + 1, sy - size / 2 + 1, size - 2, size - 2);
    deps.ctx.restore();
  }
};
