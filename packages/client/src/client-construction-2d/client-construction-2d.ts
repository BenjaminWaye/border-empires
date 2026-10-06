import { drawCenteredOverlayWithAlpha } from "../client-map-render/client-map-render-centered-overlay.js";
import { crewCycleState, crewSeed01 } from "../client-construction-phase/client-construction-crew-cycle.js";
import {
  CONSTRUCTION_PHASES,
  constructionCratesAt,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";

// 2D-canvas counterpart of the 3D construction pipeline
// (docs/construction-animation-plan.md): the 2D renderer is the accessibility
// fallback, so it gets the same phases, parts stack and crew -- drawn cheaply.
// The structure sprite fills in from the bottom in the same bands the 3D
// pieces appear in, a dashed outline marks what is still to come, a few
// cyan squares are the parts stack, and dots are the ancillary crew, walking
// the shared crewCycleState.
const GHOST_ALPHA = 0.2;
const DASH = [3, 3];
const OUTLINE_COLOR = "rgba(255, 226, 160, 0.85)";
const CRATE_COLOR = "rgba(79, 216, 255, 0.95)";
const FIGURE_COLOR = "#0a0d12";
const FIGURE_RIM = "rgba(255, 255, 255, 0.75)";

export const drawConstructionStructure2D = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale: number,
  site: ConstructionSite,
  nowMs: number
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

  // Parts stack (back-left corner) and the crew walking between it and the
  // structure. Skipped at tiny zoom where they would be sub-pixel noise.
  if (size < 12) return;
  const crate = Math.max(2, size * 0.09);
  const stackX = px + size * 0.08;
  const stackY = py + size * 0.9;
  const crates = constructionCratesAt(site.direction, site.startedAtMs, site.completesAtMs, site.pausedAtMs ?? Date.now());
  ctx.fillStyle = CRATE_COLOR;
  for (let c = 0; c < crates; c += 1) ctx.fillRect(stackX + (c % 2) * (crate + 1), stackY - Math.floor(c / 2) * (crate + 1) - crate, crate, crate);

  const seed = crewSeed01(site.x, site.y);
  const { along, carrying } = crewCycleState(nowMs, seed, site.direction, site.stalled);
  const dot = Math.max(2, size * 0.07);
  const centerX = px + size / 2;
  const centerY = py + size / 2;
  for (let i = 0; i < site.crew; i += 1) {
    const angle = seed * Math.PI * 2 + (i / site.crew) * Math.PI * 2;
    const workX = centerX + Math.cos(angle) * size * 0.4;
    const workY = centerY + Math.sin(angle) * size * 0.4;
    const startX = stackX + crate * 2 + (i % 3) * dot;
    const startY = stackY - Math.floor(i / 3) * dot;
    const x = startX + (workX - startX) * along;
    const y = startY + (workY - startY) * along;
    ctx.fillStyle = FIGURE_COLOR;
    ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    ctx.strokeStyle = FIGURE_RIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - dot / 2, y - dot / 2, dot, dot);
    if (carrying) {
      ctx.fillStyle = CRATE_COLOR;
      ctx.fillRect(x - dot / 4, y - dot - dot / 2, dot / 2, dot / 2);
    }
  }
};
