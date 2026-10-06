import type { Tile } from "../client-types.js";
import {
  drawCenteredOverlayRotatedWithAlpha,
  drawCenteredOverlayWithAlpha
} from "../client-map-render/client-map-render-centered-overlay.js";
import { drawConstructionAmbient2D, drawConstructionStructure2D } from "../client-construction-2d/client-construction-2d.js";
import { constructionSiteForTile } from "../client-construction-phase/client-construction-phase.js";
import {
  fortificationOpeningForTile,
  fortificationOverlayAlphaForTile,
  fortificationOverlayKindForTile,
  siegeBatteryFacingRadiansForTile,
  stackedRelayBeaconForTile,
  type FortificationOpening,
  type FortificationOverlayDeps,
  type FortificationOverlayKind
} from "./client-fortification-overlays.js";

// Which structure record a fortification overlay kind is built from; undefined for
// kinds that have no construction rendering yet (siege camps).
const constructionFieldFor = (kind: FortificationOverlayKind): "fort" | "economicStructure" | undefined =>
  kind === "RELAY_BEACON" ? "economicStructure" : kind === "SIEGE_OUTPOST" ? undefined : "fort";

// Split out of client-runtime-loop.ts (already over the repo's 500-line
// file-growth cap): the 2D-canvas draw for a fortification overlay tile.
// Every kind gets a plain centered draw except SIEGE_OUTPOST/Siege Battery,
// which aims itself at the nearest known rival tile (see
// siegeBatteryFacingRadiansForTile) -- the 2D counterpart to the 3D
// renderer's facingRad on the siege machine overlay.
export const drawFortificationOverlay2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  kind: FortificationOverlayKind,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  facingDeps: FortificationOverlayDeps,
  nowMs: number = performance.now()
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  // A Relay Beacon or a fort being built or removed is drawn in phases with a parts stack
  // and crew (docs/construction-animation-plan.md); siege camps keep the flat translucent
  // look until their own follow-up.
  const field = constructionFieldFor(kind);
  const site = field ? constructionSiteForTile(tile, Date.now(), field) : undefined;
  // A fort *upgrade* keeps the previous tier standing and defending, so it stays fully
  // drawn below; only the ambient crates and crew are added on top.
  const upgradeInProgress = field === "fort" && Boolean(tile.fort?.upgradingFrom);
  if (site && !upgradeInProgress) {
    drawConstructionStructure2D(ctx, overlay, px, py, size, 1, site, nowMs);
    return;
  }
  const alpha = fortificationOverlayAlphaForTile(tile, kind);
  if (kind === "SIEGE_OUTPOST") {
    const facingRad = siegeBatteryFacingRadiansForTile(tile, facingDeps);
    // Canvas rotate() is visually clockwise for +angle in this y-down screen
    // space, the opposite handedness from the 3D renderer's Y-axis rotation
    // -- negate so both renderers turn to face the same screen direction.
    drawCenteredOverlayRotatedWithAlpha(ctx, overlay, px, py, size, -facingRad, 1, alpha);
    return;
  }
  drawCenteredOverlayWithAlpha(ctx, overlay, px, py, size, 1, alpha);
  if (site) drawConstructionAmbient2D(ctx, px, py, size, site, nowMs);
};

// The tile's fortification overlay plus, when a Relay Beacon shares the tile
// with a Palisade/Fort, the beacon drawn on top so the fort doesn't hide it.
// 2D counterpart to addFortificationInstancesForTile (client-map-3d-fortification-instances.ts).
export const drawTileFortificationOverlays2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
  deps: FortificationOverlayDeps,
  overlayImageFor: (kind: FortificationOverlayKind, opening: FortificationOpening) => HTMLImageElement | undefined,
  nowMs: number = performance.now()
): void => {
  const kind = fortificationOverlayKindForTile(tile);
  if (!kind) return;
  drawFortificationOverlay2D(ctx, tile, kind, overlayImageFor(kind, fortificationOpeningForTile(tile, deps)), px, py, size, deps, nowMs);
  if (stackedRelayBeaconForTile(tile)) {
    drawFortificationOverlay2D(ctx, tile, "RELAY_BEACON", overlayImageFor("RELAY_BEACON", "CLOSED"), px, py, size, deps, nowMs);
  }
};
