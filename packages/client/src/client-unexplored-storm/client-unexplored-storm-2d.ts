import { UNEXPLORED_STORM_DARK, UNEXPLORED_STORM_LIGHT, UNEXPLORED_STORM_MID } from "./client-unexplored-storm-palette.js";

// 2D canvas counterpart of client-map-3d-unexplored-storm.ts: unexplored
// tiles are filled from one seamlessly tiling storm-cloud texture (soft
// cloud masses plus diagonal rain streaks), anchored to world coordinates so
// the clouds stay put under the map while the camera pans.
export const UNEXPLORED_STORM_TEXTURE_PX = 256;
// World tiles one copy of the texture spans. Large enough that the repeat
// isn't obvious, with cloud features sized like the 3D shader's (~5 tiles).
export const UNEXPLORED_STORM_TEXTURE_TILES = 16;
// Integer so the streaks wrap seamlessly at the texture edge; 6 matches the
// 3D shader's ~1.3-tile streak spacing.
const STREAK_BANDS_PER_TEXTURE = 6;
// Base noise cells per texture for the fine cloud body and the broad masses.
const BODY_LATTICE = 3;
const MASS_LATTICE = 2;

type Rgb = readonly [number, number, number];
const hexRgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const latticeHash = (x: number, y: number, period: number, seed: number): number => {
  const wx = ((x % period) + period) % period;
  const wy = ((y % period) + period) % period;
  const s = Math.sin(wx * 127.1 + wy * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Value noise on a lattice that wraps every `period` cells, so the octave
// tiles seamlessly across the texture edge.
const periodicNoise = (u: number, v: number, period: number, seed: number): number => {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = latticeHash(x0, y0, period, seed);
  const b = latticeHash(x0 + 1, y0, period, seed);
  const c = latticeHash(x0, y0 + 1, period, seed);
  const d = latticeHash(x0 + 1, y0 + 1, period, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

// u, v in [0, 1): position across the texture.
const periodicFbm = (u: number, v: number, lattice: number, seed: number): number => {
  let sum = 0;
  let amp = 0.5;
  let period = lattice;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amp * periodicNoise(u * period, v * period, period, seed + octave);
    period *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
};

/** RGBA pixels of the seamless storm texture (exported for tests). */
export const buildUnexploredStormPixels = (sizePx: number = UNEXPLORED_STORM_TEXTURE_PX): Uint8ClampedArray => {
  const dark = hexRgb(UNEXPLORED_STORM_DARK);
  const mid = hexRgb(UNEXPLORED_STORM_MID);
  const light = hexRgb(UNEXPLORED_STORM_LIGHT);
  const out = new Uint8ClampedArray(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py += 1) {
    for (let px = 0; px < sizePx; px += 1) {
      const u = px / sizePx;
      const v = py / sizePx;
      const body = periodicFbm(u, v, BODY_LATTICE, 1);
      const mass = periodicFbm(u, v, MASS_LATTICE, 11);
      let color = mixRgb(dark, mid, smoothstep(0.3, 0.75, (body + mass) / 2));
      color = mixRgb(color, light, smoothstep(0.6, 0.85, body) * 0.55);
      // Rain streaks run top-left to bottom-right, heaviest under the
      // densest cloud.
      const phase = ((px - py) / sizePx) * STREAK_BANDS_PER_TEXTURE * Math.PI * 2;
      const streak = smoothstep(0.86, 1, Math.abs(Math.sin(phase))) * smoothstep(0.45, 0.7, mass);
      color = mixRgb(color, mixRgb(dark, [0, 0, 0], 0.2), streak * 0.4);
      const i = (py * sizePx + px) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = 255;
    }
  }
  return out;
};

let cachedPattern: { ctx: CanvasRenderingContext2D; pattern: CanvasPattern } | undefined;

const stormPatternFor = (ctx: CanvasRenderingContext2D): CanvasPattern | undefined => {
  if (cachedPattern?.ctx === ctx) return cachedPattern.pattern;
  if (typeof document === "undefined" || typeof ctx.createPattern !== "function") return undefined;
  const source = document.createElement("canvas");
  source.width = UNEXPLORED_STORM_TEXTURE_PX;
  source.height = UNEXPLORED_STORM_TEXTURE_PX;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx || typeof sourceCtx.createImageData !== "function") return undefined;
  const image = sourceCtx.createImageData(UNEXPLORED_STORM_TEXTURE_PX, UNEXPLORED_STORM_TEXTURE_PX);
  image.data.set(buildUnexploredStormPixels());
  sourceCtx.putImageData(image, 0, 0);
  const pattern = ctx.createPattern(source, "repeat");
  if (!pattern) return undefined;
  cachedPattern = { ctx, pattern };
  return pattern;
};

/** Fills one unexplored tile's screen square with the world-anchored storm clouds. */
export const drawUnexploredStormTile = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number
): void => {
  const pattern = stormPatternFor(ctx);
  if (pattern && typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
    const scale = (size * UNEXPLORED_STORM_TEXTURE_TILES) / UNEXPLORED_STORM_TEXTURE_PX;
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, px - wx * size, py - wy * size]));
    ctx.fillStyle = pattern;
  } else {
    ctx.fillStyle = UNEXPLORED_STORM_MID;
  }
  ctx.fillRect(px, py, size, size);
};
