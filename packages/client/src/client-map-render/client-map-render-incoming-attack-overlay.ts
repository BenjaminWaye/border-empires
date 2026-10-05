// 2D under-attack overlay for a tile this player owns. Split out of
// client-map-render.ts (over the repo's 500-line growth cap).
//
// `claim` is set when the attack is a guaranteed capture of this player's
// FRONTIER tile (see activeIncomingFrontierClaims): the 2D counterpart of the
// 3D claim plate -- the attacker's colour sweeps in from the left as the
// combat lock runs down, under the usual red pulse and cross.
export type IncomingAttackClaimOverlay = { color: string; progress: number };

export const drawIncomingAttackOverlay = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  resolvesAt: number,
  claim?: IncomingAttackClaimOverlay
): void => {
  if (size < 10) return;
  const remainingMs = Math.max(0, resolvesAt - Date.now());
  const urgency = Math.max(0.2, Math.min(1, 1 - remainingMs / 4000));
  const phase = Date.now() / 180 + wx * 0.9 + wy * 0.7;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase));
  const alpha = 0.18 + pulse * (0.16 + urgency * 0.22);
  const ringInset = 1 + Math.max(0, Math.floor(size * 0.08 * (1 - pulse)));
  ctx.save();
  if (claim) {
    const progress = Math.max(0, Math.min(1, claim.progress));
    ctx.fillStyle = "rgba(9, 14, 24, 0.45)";
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = claim.color;
    ctx.globalAlpha = 0.35 + progress * 0.4;
    ctx.fillRect(px + 1, py + 1, Math.max(1, Math.floor((size - 2) * progress)), size - 2);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = `rgba(255, 72, 72, ${alpha.toFixed(3)})`;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.strokeStyle = `rgba(255, 214, 214, ${(0.38 + urgency * 0.34 + pulse * 0.08).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + ringInset, py + ringInset, size - ringInset * 2, size - ringInset * 2);
  const cx = px + size / 2;
  const cy = py + size / 2;
  const arm = Math.max(3, size * 0.18);
  ctx.strokeStyle = `rgba(72, 10, 10, ${(0.52 + urgency * 0.22).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy - arm);
  ctx.lineTo(cx + arm, cy + arm);
  ctx.moveTo(cx + arm, cy - arm);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.stroke();
  ctx.restore();
};
