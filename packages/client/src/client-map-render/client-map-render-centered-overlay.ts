// Centered-overlay draw helpers, split out of client-map-render.ts (already
// over the repo's 500-line file-growth cap) so that file can shrink instead
// of growing further.

export const drawCenteredOverlay = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const drawSize = size * scale;
  const offset = (drawSize - size) / 2;
  ctx.drawImage(overlay, px - offset, py - offset, drawSize, drawSize);
};

export const drawCenteredOverlayWithAlpha = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08,
  alpha = 1
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  drawCenteredOverlay(ctx, overlay, px, py, size, scale);
  ctx.globalAlpha = prevAlpha;
};

// 2D-renderer counterpart to the 3D Siege Battery's facingRad: the sprite is
// drawn nose-"south" (rotationRad 0 matches the 3D model's default pose), so
// rotating the canvas around the tile center by the same yaw the 3D overlay
// uses keeps both renderers aiming at the same rival tile.
export const drawCenteredOverlayRotatedWithAlpha = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  rotationRad: number,
  scale = 1.08,
  alpha = 1
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);
  ctx.translate(-cx, -cy);
  drawCenteredOverlay(ctx, overlay, px, py, size, scale);
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
};
