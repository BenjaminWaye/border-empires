// Keeps one bad frame from taking the whole client down.
//
// Playtest 2026-11-25: on the 2D map, opening a just-captured town from the
// Towns tab threw "Failed to execute 'arc' ... The radius provided (-66.5) is
// negative" out of the draw loop. The throw escaped requestAnimationFrame, the
// global error guard put up the fatal "Reload" screen and the loop never
// rescheduled itself. The cause was a negative state.zoom for a frame (the
// close-up glide, client-hud-v2-camera.ts); every `size * k` radius on the 2D
// map then went negative. These two guards sit at the draw loop so no single
// value can do that again:
// - renderTileSize keeps the tile size the 2D renderer draws with in range;
// - startGuardedDrawLoop catches a throwing frame, resets the canvas state it
//   may have left half-drawn, logs it once per distinct message, counts it,
//   and schedules the next frame instead of stopping the map.
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";

/** The tile size (px per tile) a frame draws with: state.zoom kept inside [MIN_ZOOM, MAX_ZOOM], never NaN. */
export const renderTileSize = (zoom: number): number =>
  Number.isFinite(zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : MIN_ZOOM;

const MAX_REPORTED_MESSAGES = 20;
const reportedMessages = new Set<string>();
let skippedFrames = 0;

/** Frames dropped because drawing them threw (the guard's skip counter). */
export const skippedDrawFrameCount = (): number => skippedFrames;

type ResettableContext = Pick<CanvasRenderingContext2D, "setTransform" | "setLineDash"> & {
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  reset?: () => void;
};

/** Puts the context back to defaults after a frame that threw mid-draw (open save()s, transforms, alpha). */
export const resetCanvasContext = (ctx: ResettableContext): void => {
  if (typeof ctx.reset === "function") {
    ctx.reset();
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setLineDash([]);
};

/** Runs one frame; if it throws, recovers and schedules the next one so the map keeps drawing. */
export const runGuardedFrame = (draw: () => void, ctx: ResettableContext, scheduleNext: () => void): void => {
  try {
    draw();
  } catch (error) {
    skippedFrames += 1;
    const message = error instanceof Error ? error.message : String(error);
    if (!reportedMessages.has(message) && reportedMessages.size < MAX_REPORTED_MESSAGES) {
      reportedMessages.add(message);
      console.error("[render] skipped a map frame that threw while drawing", error);
    }
    try {
      resetCanvasContext(ctx);
    } catch {
      // Nothing more to do: the next frame repaints the whole canvas.
    }
    scheduleNext();
  }
};

/**
 * Starts the draw loop under the guard and returns the guarded frame callback.
 * `draw` reschedules itself with requestAnimationFrame(frame) on success, as before.
 * The first frame is requested, not run inline: the caller's `const frame = ...`
 * must be assigned before draw() can reach it.
 */
export const startGuardedDrawLoop = (
  draw: () => void,
  ctx: ResettableContext,
  schedule: (callback: () => void) => unknown = requestAnimationFrame
): (() => void) => {
  const frame = (): void => runGuardedFrame(draw, ctx, () => schedule(frame));
  schedule(frame);
  return frame;
};
