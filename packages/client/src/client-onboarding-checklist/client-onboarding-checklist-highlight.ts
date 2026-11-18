// Draws a small pulsing ring marker over each onboarding-checklist highlight
// tile (a nearby town to Expand To while step EXPAND_TOWN is open, and
// nearby unclaimed food tiles while step EXPAND_FOOD is open). Deliberately
// simple:
// on-screen tiles only, no off-screen edge-locator like
// drawPersistentAlertLocators has for far-away alerts -- these tiles are
// meant to be found by looking at the map near the player's own town, not
// chased across the world.

export type OnboardingHighlightTile = { x: number; y: number };

/** Call once per render frame, after the main map/tile draw. */
export const drawOnboardingChecklistHighlights = (
  tiles: readonly OnboardingHighlightTile[],
  deps: {
    ctx: CanvasRenderingContext2D;
    worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
    size: number;
    halfW: number;
    halfH: number;
    nowMs: number;
  }
): void => {
  if (tiles.length === 0) return;
  const { ctx } = deps;
  const pulse = 0.55 + Math.sin(deps.nowMs / 320) * 0.25;
  // Wide enough to show around/outside a settled town's sprite footprint
  // instead of being drawn entirely underneath it (see the 3D counterpart's
  // RING_OUTER in client-map-3d-onboarding-checklist-highlight.ts).
  const radius = deps.size * 0.62;
  ctx.save();
  for (const tile of tiles) {
    const { sx, sy } = deps.worldToScreen(tile.x, tile.y, deps.size, deps.halfW, deps.halfH);
    // Dark halo first: the pale-green ring alone vanished on pale-green and
    // beige land for a deuteranope (playtest 2026-11-12), so the marker reads
    // by lightness contrast, not hue.
    ctx.globalAlpha = Math.min(1, pulse + 0.2);
    ctx.strokeStyle = GUIDE_MARKER_HALO;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = GUIDE_MARKER_RING;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
    drawGuideChevrons(ctx, sx, sy, radius, deps.size);
  }
  ctx.restore();
};

export const GUIDE_MARKER_RING = "rgba(126, 224, 138, 0.95)";
export const GUIDE_MARKER_HALO = "rgba(12, 20, 14, 0.85)";

/**
 * Shape cue: four arrowheads outside the ring pointing in at the tile, so the
 * marker is findable without telling its colour from the land's. Exported for
 * the regression test; the 3D overlay draws the same four arrowheads.
 */
type Point = [number, number];
export type GuideChevron = [Point, Point, Point];

export const guideChevronTriangles = (sx: number, sy: number, radius: number, size: number): GuideChevron[] => {
  const tipGap = radius + Math.max(3, size * 0.06);
  const depth = Math.max(5, size * 0.18);
  const halfWidth = depth * 0.7;
  const directions: Point[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  return directions.map(([dx, dy]): GuideChevron => {
    const baseX = sx + dx * (tipGap + depth);
    const baseY = sy + dy * (tipGap + depth);
    return [[sx + dx * tipGap, sy + dy * tipGap], [baseX - dy * halfWidth, baseY + dx * halfWidth], [baseX + dy * halfWidth, baseY - dx * halfWidth]];
  });
};

const drawGuideChevrons = (ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number, size: number): void => {
  ctx.globalAlpha = 1;
  ctx.fillStyle = GUIDE_MARKER_RING;
  ctx.strokeStyle = GUIDE_MARKER_HALO;
  ctx.lineWidth = 2;
  for (const [a, b, c] of guideChevronTriangles(sx, sy, radius, size)) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
};
