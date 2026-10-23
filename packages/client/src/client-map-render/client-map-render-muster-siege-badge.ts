// 2D counterpart of the 3D muster overlay's siege ring
// (client-map-3d-muster-overlay.ts): this player's muster flag stands on a
// tile an enemy is attacking, so its troops are pinned until the fight
// resolves. The 2D map draws no muster banner of its own, so this badge is
// the flag: a pennant in the owner's colour inside a pulsing red ring, drawn
// over the usual under-attack cross so "your muster is under siege" reads at
// a glance on the accessibility renderer too.
export const drawMusterSiegeBadge = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  ownerColor: string,
  nowMs: number
): void => {
  if (size < 10) return;
  const cx = px + size * 0.74;
  const cy = py + size * 0.26;
  const radius = Math.max(4, size * 0.2);
  const pulse = 0.5 + 0.5 * Math.sin((nowMs / 900) * Math.PI * 2);
  ctx.save();
  ctx.fillStyle = "rgba(20, 8, 8, 0.78)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 59, 48, ${(0.55 + pulse * 0.45).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.stroke();
  // Pennant: pole plus a triangular flag in the owner's colour.
  const poleX = cx - radius * 0.35;
  const top = cy - radius * 0.6;
  const bottom = cy + radius * 0.6;
  ctx.strokeStyle = "#e8e2d0";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.moveTo(poleX, bottom);
  ctx.lineTo(poleX, top);
  ctx.stroke();
  ctx.fillStyle = ownerColor;
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(poleX + radius * 0.85, top + radius * 0.3);
  ctx.lineTo(poleX, top + radius * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
