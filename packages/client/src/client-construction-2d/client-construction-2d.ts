import { drawCenteredOverlayWithAlpha } from "../client-map-render/client-map-render-centered-overlay.js";
import { wanderPoint } from "../client-ancillary-wander/client-ancillary-wander.js";
import { DEFAULT_CONSTRUCTION_LAYOUT, type ConstructionLayout } from "../client-map-3d-construction/client-map-3d-construction-layout.js";
import {
  CONSTRUCTION_PHASES,
  constructionCratesAt,
  constructionCrewClockMs,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";

// 2D-canvas counterpart of the 3D construction pipeline
// (docs/construction-animation-plan.md): the 2D renderer is the accessibility
// fallback, so it gets the same phases, parts stack and crew -- drawn cheaply.
// The structure sprite fills in from the bottom in the same bands the 3D
// pieces appear in, a dashed outline marks what is still to come, a few
// cyan squares are the parts stack, and the ancillary crew are the same dark
// pixel dots with the same pause-and-walk wander as the 2D settle loader.
const GHOST_ALPHA = 0.2;
const DASH = [3, 3];
const OUTLINE_COLOR = "rgba(255, 226, 160, 0.85)";
const CRATE_COLOR = "rgba(79, 216, 255, 0.95)";
// The settle loader's dot colour (client-runtime-loop.ts).
const CREW_DOT_COLOR = "rgba(6, 8, 12, 0.9)";

export const drawConstructionStructure2D = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale: number,
  site: ConstructionSite,
  epochMs: number,
  layout: ConstructionLayout = DEFAULT_CONSTRUCTION_LAYOUT
): void => {
  const drawSize = size * scale;
  const offset = (drawSize - size) / 2;
  const top = py - offset;
  const builtHeight = (drawSize * site.visibleBands) / CONSTRUCTION_PHASES;

  // Faint full sprite as the blueprint, then the built bands at full strength.
  drawCenteredOverlayWithAlpha(ctx, overlay, px, py, size, scale, GHOST_ALPHA);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px - offset, top + drawSize - builtHeight, drawSize, builtHeight);
  ctx.clip();
  drawCenteredOverlayWithAlpha(ctx, overlay, px, py, size, scale, 1);
  ctx.restore();

  if (site.visibleBands < CONSTRUCTION_PHASES) {
    const outlineTop = top + drawSize * 0.1;
    const outlineBottom = top + drawSize - builtHeight;
    if (outlineBottom - outlineTop > 2) {
      ctx.save();
      ctx.setLineDash(DASH);
      ctx.lineWidth = 1;
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.strokeRect(px + size * 0.18, outlineTop, size * 0.64, outlineBottom - outlineTop);
      ctx.restore();
    }
  }

  drawConstructionAmbient2D(ctx, px, py, size, site, epochMs, layout);
};

// The parts stack and the crew wandering the tile, drawn on top of whatever sprite the caller
// drew. Used on its own for a fort upgrade, where the standing tier must stay fully drawn (it is
// still defending). `layout` is the same one the 3D renderer uses, so a fort's stack and crew stay
// inside its walls here too: tile-local x maps across, and the stack's ground line sits at the
// mirror of its z (the default's -0.4 lands it near the bottom-left, as before).
// `epochMs` is the wall clock, so a stalled build freezes the crew where it stood.
// Skipped at tiny zoom, where they would be sub-pixel noise.
export const drawConstructionAmbient2D = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  site: ConstructionSite,
  epochMs: number,
  layout: ConstructionLayout = DEFAULT_CONSTRUCTION_LAYOUT
): void => {
  if (size < 12) return;
  const crate = Math.max(2, size * 0.09);
  const stackX = px + size * (0.5 + layout.stackX);
  const stackY = py + size * (0.5 - layout.stackZ);
  const crates = constructionCratesAt(site.direction, site.startedAtMs, site.completesAtMs, site.pausedAtMs ?? epochMs);
  ctx.fillStyle = CRATE_COLOR;
  for (let c = 0; c < crates; c += 1) ctx.fillRect(stackX + (c % 2) * (crate + 1), stackY - Math.floor(c / 2) * (crate + 1) - crate, crate, crate);

  // The crew: the settle loader's dots -- 2 px dark squares wandering the layout's crew area.
  const swarmWidth = Math.max(3, size * layout.crewSpan);
  const swarmInset = (size - swarmWidth) / 2;
  const pixelSize = 2;
  const wanderTime = constructionCrewClockMs(site, epochMs);
  ctx.fillStyle = CREW_DOT_COLOR;
  for (let i = 0; i < site.crew; i += 1) {
    const point = wanderPoint(wanderTime, site.x, site.y, i);
    ctx.fillRect(Math.floor(px + swarmInset + point.x * (swarmWidth - pixelSize)), Math.floor(py + swarmInset + point.y * (swarmWidth - pixelSize)), pixelSize, pixelSize);
  }
};
