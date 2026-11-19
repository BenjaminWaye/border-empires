import type { ClientState } from "../client-state/client-state.js";
import { collectFrontierClaims } from "../client-frontier-claim-collect/client-frontier-claim-collect.js";
import { expandCrewAnchor, expandCrewFigurePose, expandCrewPlateProgress } from "../client-expand-crew/client-expand-crew.js";

// 2D-canvas counterpart of the 3D expand crew (client-map-3d-expand-crew/):
// the 2D renderer is the accessibility fallback, so an EXPAND gets the same
// walk-out-and-stake on the same clock (client-expand-crew.ts), drawn
// cheaply -- the claim fill as a square growing from the crew's stake point,
// and the crew as the same dark pixel dots the 2D settle loader uses. 2D has
// no slow-device gate (that watches the 3D render loop), so only reduced
// motion stands the crew still here. Only
// claims with a crew (EXPANDs) are drawn here; the 2D map draws nothing
// on-tile for an ATTACK on frontier ground.

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

// The settle loader's dot colour (client-runtime-loop.ts).
const CREW_DOT_COLOR = "rgba(6, 8, 12, 0.9)";
const FILL_ALPHA = 0.3;

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
  const dot = Math.max(2, Math.round(size * 0.07));
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
    ctx.fillStyle = CREW_DOT_COLOR;
    for (let i = 0; i < claim.crew; i += 1) {
      const pose = expandCrewFigurePose(claim, i, nowEpochMs, animate);
      if (!pose || pose.height <= 0) continue;
      // Sinking reads as the dot shrinking into the claim.
      const d = Math.max(1, Math.round(dot * pose.height));
      ctx.fillRect(Math.floor(left + pose.x * size - d / 2), Math.floor(top + pose.y * size - d / 2), d, d);
    }
  }
  ctx.restore();
}
