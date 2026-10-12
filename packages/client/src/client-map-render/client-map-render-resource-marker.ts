import { depositIconKey, drawResourceIconOnCanvas } from "../client-resource-icons/client-resource-icons.js";
import type { Tile } from "../client-types.js";

// Corner badge on resource tiles (2D map, and drawn over the 3D view too).
// The painted resource icons are too detailed to read on a bright
// resource-coloured square, so the badge is a dark plate with the resource
// colour as its rim, and the icon fills the plate.
export const drawResourceCornerMarker = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
  resourceColor: (resource: string | undefined) => string | undefined
): void => {
  if (!tile.resource) return;
  const color = resourceColor(tile.resource);
  if (!color) return;
  const badge = Math.max(12, size * 0.28);
  const inset = Math.max(2, size * 0.03);
  const x = px + inset;
  const y = py + inset;
  const rim = Math.max(1.2, badge * 0.09);
  ctx.fillStyle = "rgba(14, 12, 10, 0.88)";
  ctx.fillRect(x, y, badge, badge);
  ctx.strokeStyle = color;
  ctx.lineWidth = rim;
  ctx.strokeRect(x + rim / 2, y + rim / 2, badge - rim, badge - rim);
  const key = depositIconKey(tile.resource);
  if (!key) return;
  // fillStyle colours the text-glyph fallback used until the PNG has decoded.
  ctx.fillStyle = color;
  drawResourceIconOnCanvas(ctx, key, x + badge / 2, y + badge / 2, badge - rim * 2, `${Math.max(8, badge * 0.7)}px system-ui`);
};
