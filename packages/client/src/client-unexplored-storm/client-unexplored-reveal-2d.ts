import { setUnexploredStormFill } from "./client-unexplored-storm-2d.js";
import { UNEXPLORED_LANTERN } from "./client-unexplored-storm-palette.js";

// 2D counterpart of the 3D storm's reveal cross-fade
// (client-map-3d-unexplored-storm.ts): when a drawn tile goes from
// unexplored to explored, the storm fades off it over REVEAL_MS with a
// lantern flash, instead of popping. The canvas redraws every frame, so
// this remembers each recently drawn tile's last explored state; both maps
// are capped (oldest entries evicted first) so a long session panning a big
// world can't grow them without bound. Only tiles of at least
// UNEXPLORED_REVEAL_MIN_TILE_PX are tracked -- smaller, a fade barely reads,
// and a zoomed-out screen would hold more tiles than the cap.
//
// A tile only counts as revealed if it was seen unexplored while the map
// already showed explored land: on login or reconnect every tile reads as
// unexplored until the first chunk lands, and that must not play the reveal
// over the whole known map.

export const UNEXPLORED_REVEAL_2D_MS = 900;
export const UNEXPLORED_REVEAL_MIN_TILE_PX = 16;
// Comfortably above a 4K screen of 16 px tiles (240 x 135 = 32,400).
const MAX_TRACKED_TILES = 50_000;

export type UnexploredRevealTracker = {
  /** Records this frame's state for a tile; returns reveal progress 0..1 while it is animating, else undefined. */
  readonly observe: (key: string, unexplored: boolean, nowMs: number) => number | undefined;
  readonly size: () => number;
};

export const createUnexploredRevealTracker = (maxTracked: number = MAX_TRACKED_TILES): UnexploredRevealTracker => {
  // Per tile: when it was (last) seen unexplored, or false once explored.
  const lastUnexplored = new Map<string, number | false>();
  const revealedAt = new Map<string, number>();
  let firstExploredSeenAt = Infinity;
  const evictOldest = (map: Map<string, unknown>): void => {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  };
  const observe = (key: string, unexplored: boolean, nowMs: number): number | undefined => {
    if (!unexplored && firstExploredSeenAt === Infinity) firstExploredSeenAt = nowMs;
    const was = lastUnexplored.get(key);
    // Unexplored since before any explored land was on the map: restamp it
    // now that there is some, so a later reveal of it does count.
    const stale = typeof was === "number" && was < firstExploredSeenAt && firstExploredSeenAt <= nowMs;
    if ((was === undefined || was === false) !== !unexplored || stale) {
      lastUnexplored.delete(key);
      lastUnexplored.set(key, unexplored ? nowMs : false);
      if (lastUnexplored.size > maxTracked) evictOldest(lastUnexplored);
      if (typeof was === "number" && !unexplored && was >= firstExploredSeenAt) {
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
