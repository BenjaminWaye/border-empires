import type { Tile } from "./client-types.js";

/** Canvas counterpart of the Survey Rig: tripod, brass lens, supply case and canvas shelter. */
export const drawWaystation2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "waystation">,
  px: number, py: number, size: number, nowMs: number
): void => {
  if (!tile.waystation) return;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(size, size);
  // Lean-to and rolled canvas behind the instrument.
  ctx.fillStyle = "#ad9062";
  ctx.beginPath();
  ctx.moveTo(0.57, 0.75); ctx.lineTo(0.73, 0.37); ctx.lineTo(0.9, 0.75); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#695338";
  ctx.beginPath();
  ctx.moveTo(0.73, 0.44); ctx.lineTo(0.75, 0.75); ctx.lineTo(0.87, 0.75); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#b9a079";
  ctx.fillRect(0.68, 0.68, 0.2, 0.08);
  // Splayed legs, thick enough to survive ordinary map zoom.
  ctx.strokeStyle = "#30343b";
  ctx.lineWidth = 0.055;
  for (const [x, y] of [[0.2, 0.85], [0.53, 0.87], [0.55, 0.69]] as const) {
    ctx.beginPath(); ctx.moveTo(0.38, 0.4); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.strokeStyle = "#af8545";
  ctx.lineWidth = 0.075;
  for (const [x, y] of [[0.25, 0.73], [0.49, 0.75], [0.5, 0.61]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.005, y + 0.04); ctx.stroke();
  }
  // Equipment case with two brass straps.
  ctx.fillStyle = "#30343b";
  ctx.fillRect(0.57, 0.77, 0.28, 0.16);
  ctx.fillStyle = "#af8545";
  ctx.fillRect(0.62, 0.77, 0.025, 0.16);
  ctx.fillRect(0.77, 0.77, 0.025, 0.16);
  // Brass surveying head, dark lens barrel, bright cyan glass.
  ctx.fillStyle = "#af8545";
  ctx.fillRect(0.26, 0.23, 0.23, 0.2);
  ctx.fillStyle = "#30343b";
  ctx.beginPath(); ctx.arc(0.4, 0.32, 0.125, 0, Math.PI * 2); ctx.fill();
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0016);
  ctx.strokeStyle = "#bf9b58";
  ctx.lineWidth = 0.025;
  ctx.stroke();
  ctx.fillStyle = tile.waystation.activated ? "#789fa5" : `rgba(90,220,235,${0.85 + pulse * 0.15})`;
  ctx.beginPath(); ctx.arc(0.4, 0.32, 0.087, 0, Math.PI * 2); ctx.fill();
  if (!tile.waystation.activated) {
    ctx.fillStyle = `rgba(90,220,235,${0.1 + pulse * 0.08})`;
    ctx.beginPath(); ctx.arc(0.4, 0.32, 0.17, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};
