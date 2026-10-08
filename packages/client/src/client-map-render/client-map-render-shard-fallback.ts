// Shard-site fallback marker (drawn when the overlay image isn't loaded),
// extracted from client-map-render.ts (over the 500-line cap).
export const drawShardFallback = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void => {
  const cx = px + size / 2;
  ctx.fillStyle = "rgba(41, 26, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.76, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(22, 35, 49, 0.94)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.24);
  ctx.lineTo(px + size * 0.7, py + size * 0.42);
  ctx.lineTo(px + size * 0.63, py + size * 0.67);
  ctx.lineTo(px + size * 0.37, py + size * 0.67);
  ctx.lineTo(px + size * 0.3, py + size * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(50, 210, 233, 0.98)";
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.31);
  ctx.lineTo(px + size * 0.62, py + size * 0.45);
  ctx.lineTo(px + size * 0.57, py + size * 0.64);
  ctx.lineTo(px + size * 0.43, py + size * 0.64);
  ctx.lineTo(px + size * 0.38, py + size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 223, 132, 0.58)";
  ctx.lineWidth = Math.max(1.2, size * 0.045);
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.68, size * 0.2, size * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
};
