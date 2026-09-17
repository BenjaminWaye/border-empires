// Extracted from client-map-render.ts (which is already over the repo's
// 500-line file cap) to keep that file from growing further — see
// AGENTS.md's file-size discipline.
//
// 2D-canvas stand-in for the true-3D renderer's Voidcrystal Colossus model
// (client-map-3d-barbarian-overlay.ts / client-map-3d-voidcrystal-colossus-
// asset.ts). This is a vector glyph, not the actual sculpted asset — the 2D
// path never loads external model/image files (every other 2D overlay in
// this module is pure canvas-path drawing), and reusing that convention
// keeps the fallback renderer's asset footprint at zero. It does NOT
// reproduce the 3D overlay's walk-glide animation between tiles: that
// requires tracking per-tile-key state across frames (see the diffing in
// client-map-3d-barbarian-overlay.ts's commit()), which this per-tile,
// stateless draw call has no place to keep. Players on the 2D fallback see
// a crystalline colossus icon standing on each barbarian tile, but it pops
// between tiles rather than gliding.
export const drawBarbarianColossusOverlay = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void => {
  if (size < 10) return;
  const figSize = Math.max(6, size * 0.52);
  const cx = px + size / 2;
  const cy = py + size / 2;

  ctx.save();
  ctx.fillStyle = "rgba(90, 70, 150, 0.78)";
  ctx.strokeStyle = "rgba(190, 160, 255, 0.85)";
  ctx.lineWidth = Math.max(1, size * 0.035);

  // Torso: a tapered crystalline shard body.
  ctx.beginPath();
  ctx.moveTo(cx, cy - figSize * 0.5);
  ctx.lineTo(cx + figSize * 0.22, cy - figSize * 0.1);
  ctx.lineTo(cx + figSize * 0.16, cy + figSize * 0.42);
  ctx.lineTo(cx - figSize * 0.16, cy + figSize * 0.42);
  ctx.lineTo(cx - figSize * 0.22, cy - figSize * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Crystal shard "head" jutting up from the shoulders.
  ctx.beginPath();
  ctx.moveTo(cx, cy - figSize * 0.72);
  ctx.lineTo(cx + figSize * 0.1, cy - figSize * 0.46);
  ctx.lineTo(cx - figSize * 0.1, cy - figSize * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Angular shoulder/arm shards, one per side.
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + side * figSize * 0.2, cy - figSize * 0.14);
    ctx.lineTo(cx + side * figSize * 0.4, cy + figSize * 0.02);
    ctx.lineTo(cx + side * figSize * 0.28, cy + figSize * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // A pale inner glow so the "voidcrystal" reads as lit from within, even
  // at small tile sizes.
  ctx.fillStyle = "rgba(210, 190, 255, 0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy - figSize * 0.05, figSize * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};
