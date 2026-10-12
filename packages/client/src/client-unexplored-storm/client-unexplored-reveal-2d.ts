import { setUnexploredStormFill } from "./client-unexplored-storm-2d.js";
import { UNEXPLORED_LANTERN } from "./client-unexplored-storm-palette.js";

// 2D counterpart of the 3D storm's reveal cross-fade
// (client-map-3d-unexplored-storm.ts): when a drawn tile goes from
// unexplored to explored, the storm fades off it over REVEAL_MS with a
// lantern flash, instead of popping. The canvas redraws every frame, so
// this remembers each recently drawn tile's last explored state; both maps
// are capped (oldest entries evicted first) so a long session panning a big
// world can't grow them without bound.

export const UNEXPLORED_REVEAL_2D_MS = 900;
const MAX_TRACKED_TILES = 20_000;

export type UnexploredRevealTracker = {
  /** Records this frame's state for a tile; returns reveal progress 0..1 while it is animating, else undefined. */
  readonly observe: (key: string, unexplored: boolean, nowMs: number) => number | undefined;
  readonly size: () => number;
};

export const createUnexploredRevealTracker = (maxTracked: number = MAX_TRACKED_TILES): UnexploredRevealTracker => {
  const lastUnexplored = new Map<string, boolean>();
  const revealedAt = new Map<string, number>();
  const evictOldest = (map: Map<string, unknown>): void => {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  };
  const observe = (key: string, unexplored: boolean, nowMs: number): number | undefined => {
    const was = lastUnexplored.get(key);
    if (was !== unexplored) {
      lastUnexplored.delete(key);
      lastUnexplored.set(key, unexplored);
      if (lastUnexplored.size > maxTracked) evictOldest(lastUnexplored);
      if (was === true && !unexplored) {
        revealedAt.set(key, nowMs);
        if (revealedAt.size > maxTracked) evictOldest(revealedAt);
      }
    }
    const start = revealedAt.get(key);
    if (start === undefined) return undefined;
    const t = (nowMs - start) / UNEXPLORED_REVEAL_2D_MS;
    if (t >= 1) {
      revealedAt.delete(key);
      return undefined;
    }
    return Math.max(0, t);
  };
  return { observe, size: () => lastUnexplored.size + revealedAt.size };
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Draws the fading storm (and lantern flash) over a tile that is being revealed. */
export const drawUnexploredReveal2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  progress: number
): void => {
  const e = smooth(progress);
  ctx.save();
  ctx.globalAlpha = 1 - e;
  setUnexploredStormFill(ctx, wx, wy, px, py, size);
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = Math.sin(Math.PI * e) * 0.45;
  ctx.fillStyle = UNEXPLORED_LANTERN;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
};
