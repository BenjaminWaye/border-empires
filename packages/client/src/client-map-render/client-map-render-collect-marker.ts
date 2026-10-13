import { drawResourceIconOnCanvas } from "../client-resource-icons/client-resource-icons.js";

// Pulsing "yield ready to collect" badge on the player's settled tiles (2D map,
// and drawn over the 3D view too). It sits in the tile's top-right corner so
// it never covers the resource badge in the top-left corner
// (client-map-render-resource-marker.ts), and uses the same dark-plate style
// with a gold coin so it reads as "coin to collect".
export const drawCollectableYieldMarker = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
  const badge = Math.max(12, size * 0.28);
  const inset = Math.max(2, size * 0.03);
  const x = px + size - inset - badge;
  const y = py + inset;
  const rim = Math.max(1.2, badge * 0.09);
  ctx.fillStyle = `rgba(14, 12, 10, ${0.7 + pulse * 0.2})`;
  ctx.fillRect(x, y, badge, badge);
  ctx.strokeStyle = `rgba(255, 220, 90, ${0.6 + pulse * 0.4})`;
  ctx.lineWidth = rim;
  ctx.strokeRect(x + rim / 2, y + rim / 2, badge - rim, badge - rim);
  ctx.fillStyle = "rgba(255, 220, 90, 1)";
  drawResourceIconOnCanvas(ctx, "GOLD", x + badge / 2, y + badge / 2, badge - rim * 2, `${Math.max(8, badge * 0.7)}px system-ui`);
};
