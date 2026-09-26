import type { Tile } from "../client-types.js";

// 2D canvas Siphon overlays (docs/game-mechanics.md "Siphon"), drawn per visible tile
// by client-runtime-loop.ts's two tile passes:
//   - a drained tile (`tile.sabotage`, still live) keeps its red X;
//   - a tower locked into siphon mode (`tile.observatory.siphon`) gets a
//     crimson ring with a teal inward spiral — the 2D twin of the 3D
//     siphon-mode badge (client-map-3d-observatory-cooldown-badge-overlay.ts).
// Shown for every owner's tower, so a victim can see what is draining them.
export const drawSiphonOverlay2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "sabotage" | "observatory">,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  if (tile.sabotage && tile.sabotage.endsAt > nowMs) {
    ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
    ctx.beginPath();
    ctx.moveTo(px + 3, py + 3);
    ctx.lineTo(px + size - 3, py + size - 3);
    ctx.moveTo(px + size - 3, py + 3);
    ctx.lineTo(px + 3, py + size - 3);
    ctx.stroke();
  }
  if (!tile.observatory?.siphon) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  const radius = Math.max(3, size / 2 - 2);
  const previousLineWidth = ctx.lineWidth;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 109, 115, 0.95)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Slowly turning inward spiral: "draining toward this tower".
  const spin = ((nowMs % 3_000) / 3_000) * Math.PI * 2;
  ctx.strokeStyle = "rgba(70, 240, 210, 0.95)";
  ctx.beginPath();
  for (let step = 0; step <= 24; step += 1) {
    const t = step / 24;
    const angle = spin + t * Math.PI * 3;
    const r = (radius - 2) * (1 - t * 0.85);
    if (step === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.stroke();
  ctx.lineWidth = previousLineWidth;
};
