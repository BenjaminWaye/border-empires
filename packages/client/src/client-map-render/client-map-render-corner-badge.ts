// Corner badges in a tile's top-left corner (resource tiles, docks), drawn on
// the 2D map and over the 3D view. Two tiers, because the icon only reads once
// the tile is big enough:
// - Below CORNER_BADGE_ICON_MIN_TILE_PX (the default 22px zoom and everything
//   zoomed out, down to 10px tiles): a solid square in the badge colour. The
//   colour is the cue that tells food, titanium, crystal, umbrite and docks
//   apart from far out.
// - From CORNER_BADGE_ICON_MIN_TILE_PX up: a dark plate with the colour as its
//   rim and the icon inside.
export const CORNER_BADGE_ICON_MIN_TILE_PX = 48;

const cornerInset = (size: number): number => Math.max(2, size * 0.03);

export const drawCornerBadge = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
  drawIcon: (cx: number, cy: number, iconSize: number) => void,
  drawSmallMark?: (x: number, y: number, badge: number) => void
): void => {
  const x = px + cornerInset(size);
  const y = py + cornerInset(size);
  if (size < CORNER_BADGE_ICON_MIN_TILE_PX) {
    const badge = Math.max(9, size * 0.22);
    ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
    ctx.fillRect(x - 1, y - 1, badge + 2, badge + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, badge, badge);
    drawSmallMark?.(x, y, badge);
    return;
  }
  const badge = Math.max(16, size * 0.3);
  const rim = Math.max(1.4, badge * 0.09);
  ctx.fillStyle = "rgba(14, 12, 10, 0.88)";
  ctx.fillRect(x, y, badge, badge);
  ctx.strokeStyle = color;
  ctx.lineWidth = rim;
  ctx.strokeRect(x + rim / 2, y + rim / 2, badge - rim, badge - rim);
  // fillStyle colours any text-glyph fallback the icon drawer uses before its image decodes.
  ctx.fillStyle = color;
  drawIcon(x + badge / 2, y + badge / 2, badge - rim * 2);
};
