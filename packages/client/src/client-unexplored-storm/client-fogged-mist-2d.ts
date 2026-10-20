import {
  FOGGED_MIST_HAZE,
  FOGGED_MIST_LIGHT,
  FOGGED_MIST_MAX_OPACITY,
  FOGGED_MIST_MIN_OPACITY
} from "./client-unexplored-storm-palette.js";
import { clipBeyondFogBand2D, hexRgb, mixRgb, periodicFbm, smoothstep } from "./client-unexplored-storm-2d.js";

// 2D canvas counterpart of client-map-3d-fogged-mist.ts: remembered
// ("fogged") tiles get drifting wisps of mist over their slate wash, filled
// from one seamlessly tiling, translucent mist texture anchored to world
// coordinates (plus a slow drift), so the mist rolls across the map rather
// than sliding with the camera. Same haze -> wisp colours and opacities as
// the 3D shader.
export const FOGGED_MIST_TEXTURE_PX = 256;
// World tiles one copy of the texture spans; banks come out ~4 tiles across,
// like the 3D shader's.
export const FOGGED_MIST_TEXTURE_TILES = 16;
// Drift in tiles per second, matching the 3D banks: their noise coordinate
// is world * 0.22 + time * (0.035, 0.012), so the pattern moves through the
// world at -(0.035, 0.012) / 0.22.
const DRIFT_X_TILES_PER_SECOND = -0.035 / 0.22;
const DRIFT_Y_TILES_PER_SECOND = -0.012 / 0.22;
// Base noise cells per texture for the broad banks and the finer wisps.
const BANK_LATTICE = 4;
const WISP_LATTICE = 12;

/** RGBA pixels of the seamless mist texture, alpha included (exported for tests). */
export const buildFoggedMistPixels = (sizePx: number = FOGGED_MIST_TEXTURE_PX): Uint8ClampedArray => {
  const haze = hexRgb(FOGGED_MIST_HAZE);
  const light = hexRgb(FOGGED_MIST_LIGHT);
  const out = new Uint8ClampedArray(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py += 1) {
    for (let px = 0; px < sizePx; px += 1) {
      const u = px / sizePx;
      const v = py / sizePx;
      const banks = periodicFbm(u, v, BANK_LATTICE, 21);
      const wisps = periodicFbm(u, v, WISP_LATTICE, 31);
      const density = smoothstep(0.3, 0.85, banks * 0.6 + wisps * 0.4);
      const color = mixRgb(haze, light, density);
      const i = (py * sizePx + px) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = Math.round((FOGGED_MIST_MIN_OPACITY + (FOGGED_MIST_MAX_OPACITY - FOGGED_MIST_MIN_OPACITY) * density) * 255);
    }
  }
  return out;
};

let cachedPattern: { ctx: CanvasRenderingContext2D; pattern: CanvasPattern } | undefined;

const mistPatternFor = (ctx: CanvasRenderingContext2D): CanvasPattern | undefined => {
  if (cachedPattern?.ctx === ctx) return cachedPattern.pattern;
  if (typeof document === "undefined" || typeof ctx.createPattern !== "function") return undefined;
  const source = document.createElement("canvas");
  source.width = FOGGED_MIST_TEXTURE_PX;
  source.height = FOGGED_MIST_TEXTURE_PX;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx || typeof sourceCtx.createImageData !== "function") return undefined;
  const image = sourceCtx.createImageData(FOGGED_MIST_TEXTURE_PX, FOGGED_MIST_TEXTURE_PX);
  image.data.set(buildFoggedMistPixels());
  sourceCtx.putImageData(image, 0, 0);
  const pattern = ctx.createPattern(source, "repeat");
  if (!pattern) return undefined;
  cachedPattern = { ctx, pattern };
  return pattern;
};

// World-anchored, the transform is the same for every tile in a frame (bar
// the world-wrap seam), so it's only rebuilt when it changes.
let patternTransform: { pattern: CanvasPattern; scale: number; tx: number; ty: number } | undefined;
const sameTransform = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
// Wraps the drift clock so the offset never grows without bound.
const DRIFT_WRAP_MS = 3600 * 1000;

/**
 * Lays the drifting mist over one remembered tile's screen square (tile
 * (wx, wy) at screen (px, py)). Where canvas patterns aren't available it
 * falls back to a flat haze at the mist's mean opacity, so the tile still
 * reads as fogged.
 */
export const drawFoggedMist2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  const pattern = mistPatternFor(ctx);
  ctx.save();
  if (pattern && typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
    const seconds = (nowMs % DRIFT_WRAP_MS) / 1000;
    const scale = (size * FOGGED_MIST_TEXTURE_TILES) / FOGGED_MIST_TEXTURE_PX;
    const tx = px - (wx - seconds * DRIFT_X_TILES_PER_SECOND) * size;
    const ty = py - (wy - seconds * DRIFT_Y_TILES_PER_SECOND) * size;
    const last = patternTransform;
    if (!last || last.pattern !== pattern || !sameTransform(last.scale, scale) || !sameTransform(last.tx, tx) || !sameTransform(last.ty, ty)) {
      pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, tx, ty]));
      patternTransform = { pattern, scale, tx, ty };
    }
    ctx.fillStyle = pattern;
  } else {
    ctx.globalAlpha = (FOGGED_MIST_MIN_OPACITY + FOGGED_MIST_MAX_OPACITY) / 2;
    ctx.fillStyle = FOGGED_MIST_HAZE;
  }
  ctx.fillRect(px, py, size, size);
  ctx.restore();
};

/**
 * For a remembered tile beside tiles in sight: clips to the part of its
 * square past the same wavy band (and corner arcs) the unexplored storm
 * leaves before its edge, so the fog ends just past your vision and bends
 * like the storm's. Returns the band edges for strokeFoggedEdge2D. Call
 * between save() and restore().
 */
export const clipFoggedEdge2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  isInSightAt: (ox: number, oy: number) => boolean
): ReadonlyArray<() => void> => {
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  return clipBeyondFogBand2D(ctx, wx, wy, px, py, size, isInSightAt).edges;
};

/** A soft, pale bank of mist along the fog's edge (inside the clip, so only its fog-side half shows). */
export const strokeFoggedEdge2D = (ctx: CanvasRenderingContext2D, edges: ReadonlyArray<() => void>, size: number): void => {
  if (edges.length === 0) return;
  ctx.save();
  ctx.strokeStyle = FOGGED_MIST_LIGHT;
  for (const [alpha, width] of [[0.18, size * 0.22], [0.3, size * 0.1]] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    for (const edge of edges) {
      ctx.beginPath();
      edge();
      ctx.stroke();
    }
  }
  ctx.restore();
};
