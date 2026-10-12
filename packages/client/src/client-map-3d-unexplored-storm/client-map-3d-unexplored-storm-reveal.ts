import { encodeUnexploredStormMask, type UnexploredStormGrid, type UnexploredStormMask } from "./client-unexplored-storm-mask.js";

// The 3D reveal: when tiles become explored the clouds roll back off them
// instead of popping. Each newly explored tile's exploredness eases from 0
// to 1 over UNEXPLORED_REVEAL_MS (after a small per-tile stagger, so a batch
// doesn't move in lockstep), and the storm mask is re-encoded from those
// fractions every frame while anything animates. Everything that reads the
// mask -- the cloud contour, brass edge and lantern glow, and the trees,
// mountains and hills fitted under the cloud -- moves with it, smoothly.
//
// Tracked per world tile, not per mask texel, so it doesn't care how often
// the terrain rebuilds: a pan, or the rest of an expansion's tiles arriving
// in a later update, never restarts or snaps a tile already rolling back.

export const UNEXPLORED_REVEAL_MS = 1600;
// Up to this much extra delay per tile (by world-position hash).
export const UNEXPLORED_REVEAL_STAGGER_MS = 400;
// More tiles than this explored in one rebuild is a bulk load (a jump across
// the map, a long-missed sync), not exploring: it shows without the reveal.
export const UNEXPLORED_REVEAL_MAX_TILES = 400;
// Hard bound on tiles animating at once (normally far fewer: each finishes
// within REVEAL_MS + STAGGER_MS).
const MAX_ANIMATING_TILES = 4000;

export type UnexploredStormReveal = {
  /** A rebuild's freshly sampled window; starts the reveal for newly explored tiles. */
  readonly onGrid: (grid: UnexploredStormGrid, nowMs: number) => void;
  /** Whether any tile is still rolling back at nowMs (drops finished ones). */
  readonly isAnimating: (nowMs: number) => boolean;
  /** The mask for the current grid at nowMs, into `out` when given. */
  readonly encode: (nowMs: number, out?: Uint8Array) => UnexploredStormMask;
  /** Tiles currently animating (for tests/diagnostics). */
  readonly animatingCount: () => number;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const staggerFor = (key: number): number => {
  const h = Math.sin(key * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * UNEXPLORED_REVEAL_STAGGER_MS;
};

export const createUnexploredStormReveal = (): UnexploredStormReveal => {
  let grid: UnexploredStormGrid | undefined;
  // Last rebuild's explored state by world key (the window's tiles only).
  let lastExplored = new Map<number, boolean>();
  const startAt = new Map<number, number>();

  const onGrid = (next: UnexploredStormGrid, nowMs: number): void => {
    // No reveal on the first rebuild with land in it (login, reconnect: every
    // tile reads unexplored until the first chunk lands).
    let hadLand = false;
    for (const explored of lastExplored.values()) if (explored) { hadLand = true; break; }
    const newly: number[] = [];
    const seen = new Map<number, boolean>();
    for (let t = 0; t < next.keys.length; t += 1) {
      const key = next.keys[t]!;
      const explored = next.explored[t] === 1;
      seen.set(key, explored);
      if (!explored) startAt.delete(key);
      else if (lastExplored.get(key) === false) newly.push(key);
    }
    if (hadLand && newly.length <= UNEXPLORED_REVEAL_MAX_TILES) {
      for (const key of newly) if (!startAt.has(key)) startAt.set(key, nowMs + staggerFor(key));
      while (startAt.size > MAX_ANIMATING_TILES) startAt.delete(startAt.keys().next().value as number);
    }
    lastExplored = seen;
    grid = next;
  };

  const isAnimating = (nowMs: number): boolean => {
    for (const [key, start] of startAt) if (nowMs - start >= UNEXPLORED_REVEAL_MS) startAt.delete(key);
    return startAt.size > 0;
  };

  const encode = (nowMs: number, out?: Uint8Array): UnexploredStormMask => {
    if (!grid) return encodeUnexploredStormMask(1, 1, new Float32Array(1), undefined, out);
    const exploredness = new Float32Array(grid.explored.length);
    const flash = new Float32Array(grid.explored.length);
    for (let t = 0; t < exploredness.length; t += 1) {
      if (grid.explored[t] !== 1) continue;
      const start = startAt.get(grid.keys[t]!);
      if (start === undefined) {
        exploredness[t] = 1;
        continue;
      }
      const p = Math.min(1, Math.max(0, (nowMs - start) / UNEXPLORED_REVEAL_MS));
      exploredness[t] = smooth(p);
      // Lantern light swells and fades as the clouds part over the tile.
      flash[t] = Math.sin(Math.PI * p) ** 2;
    }
    return encodeUnexploredStormMask(grid.width, grid.height, exploredness, flash, out);
  };

  return { onGrid, isAnimating, encode, animatingCount: () => startAt.size };
};
