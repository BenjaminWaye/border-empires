/**
 * 2D (non-3D-renderer) equivalent of the 3D hatch/battery support-tile
 * overlay (client-map-3d-town-support-tile/) -- the sibling of
 * drawWatchtower2D, kept in its own file so the already-oversized
 * client-runtime-loop.ts only needs a single call site (see AGENTS.md
 * file-size discipline) instead of growing inline.
 *
 * The 3D renderer sinks a recessed hatch with a glowing battery into each of
 * a selected non-SETTLEMENT town's 8 support tiles. This draws the flat 2D
 * idiom for the same information: a small brass-framed panel with a battery
 * dot that's dark while unsettled and glows amber once the plot is settled
 * and actually contributing to the town's gold. Eligibility and the
 * settled/unsettled state come from client-town-support-plot-lookup.ts, so
 * both renderers always agree on which 8 tiles light up.
 */
export const drawTownSupportPlot2D = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  settled: boolean
): void => {
  const cx = px + size / 2;
  const cy = py + size / 2;
  const half = size * 0.24;

  ctx.save();
  ctx.fillStyle = "rgba(20, 16, 10, 0.55)";
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  ctx.strokeStyle = "#b08d55";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

  const dotRadius = half * 0.55;
  if (settled) {
    ctx.fillStyle = "#8fe6ff";
    ctx.shadowColor = "#8fe6ff";
    ctx.shadowBlur = size * 0.18;
  } else {
    ctx.fillStyle = "#20242b";
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
