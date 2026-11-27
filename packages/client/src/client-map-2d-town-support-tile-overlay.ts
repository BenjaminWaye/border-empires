import { PLOT_AMBER, PLOT_DIAMOND, PLOT_DIAMOND_HALF, PLOT_HALF, PLOT_IVORY, PLOT_LEG, PLOT_STROKE } from "./client-town-support-plot/plot-style.js";

// Same open corner brackets and centre diamond as the true-3D plot overlay.
export const drawTownSupportPlot2D = (
  ctx: CanvasRenderingContext2D, px: number, py: number, size: number, highlighted: boolean
): void => {
  const cx = px + size / 2, cy = py + size / 2;
  ctx.save();
  ctx.strokeStyle = highlighted ? PLOT_AMBER : PLOT_IVORY;
  ctx.lineWidth = Math.max(1, size * PLOT_STROKE);
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.beginPath();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = cx + sx * size * PLOT_HALF, y = cy + sy * size * PLOT_HALF;
    ctx.moveTo(x - sx * size * PLOT_LEG, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - sy * size * PLOT_LEG);
  }
  ctx.stroke();
  const d = size * PLOT_DIAMOND_HALF;
  ctx.fillStyle = highlighted ? PLOT_AMBER : PLOT_DIAMOND;
  ctx.beginPath();
  ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy);
  ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
