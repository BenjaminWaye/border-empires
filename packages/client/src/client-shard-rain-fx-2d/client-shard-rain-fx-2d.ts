/** How long the shard-rain screen streaks take to fade out after a rain lands. */
export const SHARD_RAIN_FX_FADE_MS = 8_000;

/**
 * Full-screen shard-rain streaks drawn over the map while
 * `state.shardRainFxUntil` is in the future (both renderers -- it's a
 * screen-space effect, not a tile overlay). Extracted from
 * client-runtime-loop.ts.
 */
export const drawShardRainFx2D = (
  ctx: CanvasRenderingContext2D,
  canvas: { width: number; height: number },
  shardRainFxUntil: number,
  nowMs: number
): void => {
  if (shardRainFxUntil <= nowMs) return;
  const fxProgress = Math.max(0, (shardRainFxUntil - nowMs) / SHARD_RAIN_FX_FADE_MS);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 97 + nowMs * 0.08) % canvas.width);
    const y = ((i * 59 + nowMs * 0.21) % canvas.height);
    const len = 24 + (i % 5) * 10;
    const alpha = (0.08 + (i % 3) * 0.03) * fxProgress;
    ctx.strokeStyle = `rgba(102, 224, 255, ${alpha})`;
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + len);
    ctx.stroke();
  }
  ctx.restore();
};
