// Draws a small pulsing ring marker over each onboarding-checklist highlight
// tile (the player's first town while step SETTLE_TOWN is open, and nearby
// unclaimed food tiles while step SECURE_FOOD is open). Deliberately simple:
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
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "rgba(126, 224, 138, 0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};
