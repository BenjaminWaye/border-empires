// Corner badges in a tile's top-left corner (resource tiles, docks), drawn on
// the 2D map and over the 3D view. Resource icons stay visible at every zoom;
// docks retain two tiers:
// - Below CORNER_BADGE_ICON_MIN_TILE_PX: a blue dot with a line anchor.
// - From CORNER_BADGE_ICON_MIN_TILE_PX up: the anchor icon on a dark disc
//   with a blue rim.
export const CORNER_BADGE_ICON_MIN_TILE_PX = 48;

const circlePath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
};

const cornerInset = (size: number): number => Math.max(2, size * 0.03);

export const drawCornerBadge = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
  drawIcon: (cx: number, cy: number, iconSize: number) => void,
  drawSmallMark?: (x: number, y: number, badge: number) => void,
  keepIconWhenZoomedOut = false
): void => {
  const x = px + cornerInset(size);
  const y = py + cornerInset(size);
  if (!keepIconWhenZoomedOut && size < CORNER_BADGE_ICON_MIN_TILE_PX) {
    const badge = Math.max(9, size * 0.22);
    ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
    circlePath(ctx, x + badge / 2, y + badge / 2, badge / 2 + 1);
    ctx.fill();
    ctx.fillStyle = color;
    circlePath(ctx, x + badge / 2, y + badge / 2, badge / 2);
    ctx.fill();
    drawSmallMark?.(x, y, badge);
    return;
  }
  // Grow smoothly through the former cutoff. At distant zoom the icon gets
  // more of the tile, while the circle still fits inside its tile's edge.
  const badge = keepIconWhenZoomedOut
    ? Math.min(size - cornerInset(size), Math.max(12, Math.min(22, size * 0.6), size * 0.3))
    : Math.max(22, size * 0.3);
  const rim = Math.max(1, badge * 0.04);
  ctx.fillStyle = "rgba(14, 12, 10, 0.88)";
  circlePath(ctx, x + badge / 2, y + badge / 2, badge / 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = rim;
  circlePath(ctx, x + badge / 2, y + badge / 2, (badge - rim) / 2);
  ctx.stroke();
  // fillStyle colours any text-glyph fallback the icon drawer uses before its image decodes.
  ctx.fillStyle = color;
  drawIcon(x + badge / 2, y + badge / 2, badge - rim * 2);
};
