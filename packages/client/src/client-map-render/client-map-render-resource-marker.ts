import { depositIconKey, drawResourceIconOnCanvas } from "../client-resource-icons/client-resource-icons.js";
import type { Tile } from "../client-types.js";
import { drawCornerBadge } from "./client-map-render-corner-badge.js";

// Resource icons stay on a dark, colour-rimmed disc at every zoom, in both
// renderers (see client-map-render-corner-badge.ts).
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
  const key = depositIconKey(tile.resource);
  drawCornerBadge(ctx, px, py, size, color, (cx, cy, iconSize) => {
    if (key) drawResourceIconOnCanvas(ctx, key, cx, cy, iconSize, `${Math.max(8, iconSize * 0.8)}px system-ui`);
  }, undefined, true);
};
