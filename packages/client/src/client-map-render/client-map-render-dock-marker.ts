import { drawCornerBadge } from "./client-map-render-corner-badge.js";

const DOCK_COLOR = "rgba(115, 175, 220, 0.96)";
const DOCK_ICON_URL = "/icons/simple/dock.svg";

// One shared image for the brass anchor icon (a single static URL, so this is
// never more than one element).
let dockIcon: HTMLImageElement | undefined;
const dockIconImage = (): HTMLImageElement | undefined => {
  if (typeof Image === "undefined") return undefined;
  if (!dockIcon) {
    dockIcon = new Image();
    dockIcon.decoding = "async";
    dockIcon.src = DOCK_ICON_URL;
  }
  return dockIcon.complete && dockIcon.naturalWidth > 0 ? dockIcon : undefined;
};

// Stylised line anchor for the small blue square: a ring, a stem, a crossbar
// and a curved base.
const drawLineAnchor = (ctx: CanvasRenderingContext2D, x: number, y: number, badge: number): void => {
  const cx = x + badge / 2;
  const r = Math.max(1.2, badge * 0.16);
  ctx.strokeStyle = "rgba(22, 30, 44, 0.95)";
  ctx.lineWidth = Math.max(1, badge * 0.08);
  ctx.beginPath();
  ctx.arc(cx, y + badge * 0.28, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y + badge * 0.28 + r);
  ctx.lineTo(cx, y + badge * 0.84);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, y + badge * 0.66, badge * 0.30, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + badge * 0.22, y + badge * 0.46);
  ctx.lineTo(x + badge * 0.78, y + badge * 0.46);
  ctx.stroke();
};

// Dock badge: a blue square with a line anchor when zoomed out, the brass anchor
// icon on a dark plate when zoomed in (see client-map-render-corner-badge.ts).
// fullTile fills the whole tile with the small square (used for tiny tiles).
export const drawDockMarker = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, fullTile = false): void => {
  if (fullTile) {
    const badge = Math.max(8, size - 2);
    ctx.fillStyle = "rgba(12, 16, 28, 0.78)";
    ctx.fillRect(px, py, badge + 2, badge + 2);
    ctx.fillStyle = DOCK_COLOR;
    ctx.fillRect(px + 1, py + 1, badge, badge);
    drawLineAnchor(ctx, px + 1, py + 1, badge);
    return;
  }
  drawCornerBadge(ctx, px, py, size, DOCK_COLOR, (cx, cy, iconSize) => {
    const image = dockIconImage();
    if (image) ctx.drawImage(image, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
  }, (x, y, badge) => drawLineAnchor(ctx, x, y, badge));
};
