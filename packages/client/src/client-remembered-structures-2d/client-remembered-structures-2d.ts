// 2D buildings on a tile remembered under fog: seen before, out of sight now.
// Drawn as last seen -- town, fort/siege camp/Relay Beacon, Aether Tower,
// watchtower, waystation, AFC -- faded so they read as memory, and standing
// still: animations run off a stopped clock and no build in progress is
// shown. 2D counterpart of client-map-3d-remembered-buildings.ts.
// Resource installations (a mine, hydrogarden, rig... drawn over their
// resource) are drawn here too: the live resource pass only runs in sight.
// (Other economic structures and docks already draw on fogged tiles in
// client-runtime-loop.ts.)
import type { Tile } from "../client-types.js";
import { tileHasTownIdentity } from "../client-town-identity.js";
import { drawTileFortificationOverlays2D } from "../client-fortification-overlays/client-fortification-overlay-2d-draw.js";
import type { FortificationOpening, FortificationOverlayDeps, FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";
import { drawAetherTowerSprite2D, type AetherTowerSprite2DDeps } from "../client-aether-tower-sprite-2d/client-aether-tower-sprite-2d.js";
import { drawWatchtower2D } from "../client-map-2d-watchtower-overlay.js";
import { drawWaystation2D } from "../client-map-2d-waystation-overlay.js";
import { drawAfc2D } from "../client-map-2d-afc-overlay.js";
import { isAfcHiddenForJoinDrop, type AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import type { ResourceOverlayDrawDeps } from "../client-resource-overlay-2d/client-resource-overlay-2d.js";

/** Matches the remembered relic's fade (client-map-2d-tile-feature-overlays.ts). */
export const REMEMBERED_STRUCTURE_ALPHA_2D = 0.7;
/** The clock remembered animations are drawn at: the same frame every time. */
const STOPPED_CLOCK_MS = 0;

export type RememberedStructures2DDeps = {
  readonly drawTownOverlay: (tile: Tile, px: number, py: number, size: number) => void;
  readonly fortificationOverlayImageFor: (kind: FortificationOverlayKind, opening: FortificationOpening) => HTMLImageElement | undefined;
  readonly fortificationDeps: FortificationOverlayDeps;
  readonly aetherTowerSprite: AetherTowerSprite2DDeps;
  /** An AFC still landing (join drop) is not drawn yet, as in sight. */
  readonly afcJoinDrop: AfcJoinDropState;
  readonly resourceInstallations: Pick<ResourceOverlayDrawDeps, "builtResourceOverlayForTile" | "drawCenteredOverlayWithAlpha" | "resourceOverlayScaleForTile" | "economicStructureOverlayAlpha">;
};

export const drawRememberedStructures2D = (
  ctx: CanvasRenderingContext2D,
  deps: RememberedStructures2DDeps,
  tile: Tile,
  px: number,
  py: number,
  size: number
): void => {
  if (tile.terrain !== "LAND") return;
  ctx.save();
  ctx.globalAlpha *= REMEMBERED_STRUCTURE_ALPHA_2D;
  const installation = deps.resourceInstallations.builtResourceOverlayForTile(tile);
  if (installation?.complete && installation.naturalWidth) {
    const { resourceInstallations: draw } = deps;
    draw.drawCenteredOverlayWithAlpha(installation, px, py, size, draw.resourceOverlayScaleForTile(tile), draw.economicStructureOverlayAlpha(tile));
  }
  if (tileHasTownIdentity(tile)) deps.drawTownOverlay(tile, px, py, size);
  drawTileFortificationOverlays2D(ctx, tile, px, py, size, deps.fortificationDeps, deps.fortificationOverlayImageFor, Date.now(), true);
  if (tile.observatory) drawAetherTowerSprite2D(deps.aetherTowerSprite, tile.observatory, tile.ownerId, px, py, size);
  // Without its reveal window: the reveal ring is live state, timed off the wall clock.
  if (tile.watchtower) drawWatchtower2D(ctx, { x: tile.x, y: tile.y, watchtower: { activated: tile.watchtower.activated } }, px, py, size, STOPPED_CLOCK_MS);
  if (tile.waystation) drawWaystation2D(ctx, tile, px, py, size, STOPPED_CLOCK_MS);
  if (tile.afc && !isAfcHiddenForJoinDrop(deps.afcJoinDrop, tile.x, tile.y)) drawAfc2D(ctx, tile, px, py, size, STOPPED_CLOCK_MS);
  ctx.restore();
};
