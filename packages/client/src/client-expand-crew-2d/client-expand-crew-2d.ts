import type { ClientState } from "../client-state/client-state.js";
import { collectFrontierClaims } from "../client-frontier-claim-collect/client-frontier-claim-collect.js";
import { expandCrewAnchor, expandCrewFigurePose, expandCrewPlateProgress } from "../client-expand-crew/client-expand-crew.js";
import { drawSoldierGlyph2D } from "../client-map-render/client-map-render-planetary-defense-overlay.js";

// 2D-canvas counterpart of the 3D expand crew (client-map-3d-expand-crew/):
// the 2D renderer is the accessibility fallback, so an EXPAND gets the same
// walk-out-and-patrol on the same clock (client-expand-crew.ts), drawn
// cheaply -- the claim fill as a square growing from the crew's arrival point,
// and the crew as the same soldier glyphs the 2D Planetary Defense patrol
// uses (client-map-render-planetary-defense-overlay.ts), in this player's
// colour, crouching for the closing kneel. Like that patrol, the glyphs are
// skipped below 10px tiles, where only the fill shows. 2D has
// no slow-device gate (that watches the 3D render loop), so only reduced
// motion stands the crew still here. Only
// claims with a crew (EXPANDs) are drawn here; the 2D map draws nothing
// on-tile for an ATTACK on frontier ground.

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

const FILL_ALPHA = 0.3;
const KNEEL_HEIGHT = 0.7;

// One MediaQueryList for the session, read live each frame (so toggling the
// OS setting takes effect without a reload) without allocating a new one.
let reducedMotionQuery: MediaQueryList | undefined;
const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
};

export function drawExpandCrews2D(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D,
  // This player's territory colour as the 2D map draws it
  // (effectiveOverlayColor, so the diplomacy lens recolour matches): crew
  // claims are always this player's own.
  ownerColor: string,
  size: number,
  halfW: number,
  halfH: number,
  nowEpochMs: number = Date.now(),
  animate: boolean = !prefersReducedMotion()
): void {
  const claims = collectFrontierClaims(state, keyFor, nowEpochMs);
  if (claims.length === 0) return;
  const glyphH = Math.max(5, size * 0.34);
  ctx.save();
  for (const claim of claims) {
    if (claim.crew <= 0) continue;
    const center = worldToScreen(claim.targetX, claim.targetY, size, halfW, halfH);
    const left = center.sx - size / 2;
    const top = center.sy - size / 2;

    const t = expandCrewPlateProgress(claim, nowEpochMs);
    if (t > 0) {
      const anchor = expandCrewAnchor(claim);
      const span = (size - 2) * t;
      const cx = left + (anchor.x + (0.5 - anchor.x) * t) * size;
      const cy = top + (anchor.y + (0.5 - anchor.y) * t) * size;
      ctx.globalAlpha = FILL_ALPHA;
      ctx.fillStyle = ownerColor;
      ctx.fillRect(cx - span / 2, cy - span / 2, span, span);
    }

    ctx.globalAlpha = 1;
    if (size < 10) continue;
    for (let i = 0; i < claim.crew; i += 1) {
      const pose = expandCrewFigurePose(claim, i, nowEpochMs, animate);
      if (!pose) continue;
      const h = pose.stance === "kneel" ? glyphH * KNEEL_HEIGHT : glyphH;
      const stride = pose.stance === "walk" ? Math.sin(nowEpochMs * 0.012 + i * 1.7) : 0;
      // Feet sit at the pose point; tile-local y is screen-down.
      drawSoldierGlyph2D(ctx, left + pose.x * size, top + pose.y * size + glyphH * 0.45, h, Math.sin(pose.yaw) < 0, stride, ownerColor);
    }
  }
  ctx.restore();
}
