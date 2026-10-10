import {
  UNEXPLORED_BRASS,
  UNEXPLORED_BRASS_DARK,
  UNEXPLORED_PARCHMENT,
  UNEXPLORED_PARCHMENT_INK,
  UNEXPLORED_RIVET,
  UNEXPLORED_STORM_DARK,
  UNEXPLORED_STORM_INK,
  UNEXPLORED_STORM_LIGHT,
  UNEXPLORED_STORM_MID
} from "./client-unexplored-storm-palette.js";

// 2D canvas counterpart of client-map-3d-unexplored-storm.ts: unexplored
// tiles are filled from one seamlessly tiling storm-cloud texture (soft
// cloud masses under straight engraved hatching), anchored to world coordinates so
// the clouds stay put under the map while the camera pans.
export const UNEXPLORED_STORM_TEXTURE_PX = 256;
// World tiles one copy of the texture spans. Large enough that the repeat
// isn't obvious, with cloud features sized like the 3D shader's (~5 tiles).
export const UNEXPLORED_STORM_TEXTURE_TILES = 16;
// Hatch lines per texture along x. Integer so they wrap seamlessly at the
// texture edge; 45 / 16 tiles ~= the 3D shader's 2.8 lines per tile.
const HATCH_LINES_PER_TEXTURE = 45;
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
  const ink = hexRgb(UNEXPLORED_STORM_INK);
  const out = new Uint8ClampedArray(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py += 1) {
    for (let px = 0; px < sizePx; px += 1) {
      const u = px / sizePx;
      const v = py / sizePx;
      const body = periodicFbm(u, v, BODY_LATTICE, 1);
      const mass = periodicFbm(u, v, MASS_LATTICE, 11);
      let color = mixRgb(dark, mid, smoothstep(0.3, 0.75, (body + mass) / 2));
      color = mixRgb(color, light, smoothstep(0.6, 0.85, body) * 0.55);
      // Straight engraved hatching, top-left to bottom-right, heavier under
      // the densest cloud.
      const hatchCoord = ((px - py) / sizePx) * HATCH_LINES_PER_TEXTURE;
      const hatchDist = Math.abs(hatchCoord - Math.round(hatchCoord));
      const hatch = 1 - smoothstep(0.1 + mass * 0.12, 0.22 + mass * 0.12, hatchDist);
      color = mixRgb(color, ink, hatch * (0.25 + smoothstep(0.35, 0.75, mass) * 0.45));
      const i = (py * sizePx + px) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = 255;
    }
  }
  return out;
};

export const UNEXPLORED_STORM_EDGE_COLOR = "rgba(40, 44, 46, 0.35)";
const UNEXPLORED_STORM_EDGE_MIN_TILE_PX = 8;

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

/**
 * Sets fillStyle to the storm, world-anchored so tile (wx, wy) lands at
 * screen (px, py); a solid storm grey where patterns aren't available.
 */
export const setUnexploredStormFill = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number): void => {
  const pattern = stormPatternFor(ctx);
  if (pattern && typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
    const scale = (size * UNEXPLORED_STORM_TEXTURE_TILES) / UNEXPLORED_STORM_TEXTURE_PX;
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, px - wx * size, py - wy * size]));
    ctx.fillStyle = pattern;
  } else {
    ctx.fillStyle = UNEXPLORED_STORM_MID;
  }
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
  setUnexploredStormFill(ctx, wx, wy, px, py, size);
  ctx.fillRect(px, py, size, size);
  // Faint tile edges under the cloud (top + left, so each shared edge is
  // drawn once), matching the 3D layer's hinted grid. Skipped once tiles
  // are too small for a line to read as anything but noise.
  if (size >= UNEXPLORED_STORM_EDGE_MIN_TILE_PX) {
    ctx.fillStyle = UNEXPLORED_STORM_EDGE_COLOR;
    ctx.fillRect(px, py, size, 1);
    ctx.fillRect(px, py + 1, 1, size - 1);
  }
};

// 2D counterpart of the 3D storm shader's fog coast
// (client-map-3d-unexplored-storm-shader.ts), for the first ring of fog:
// unexplored tiles with an explored tile among their 8 neighbours. The
// caller draws the ring tile's own ground (dimmed) first; this then lays
//   1. a see-through hatched parchment wash over the whole tile;
//   2. the storm, only beyond a wavy line ~0.6-0.8 tile in from every side
//      (or corner) that touches explored land;
//   3. a brass survey edge along that line (bright brass, a darker storm-side
//      edge) with rivets where it meets the tile's edges.
// Explored tiles themselves are never drawn on. The waves are keyed to world
// coordinates along the edge, so they run continuously between tiles.

type Side = {
  readonly ox: number;
  readonly oy: number;
  /** Screen point at fraction `t` along the side, `depth` px into the tile. */
  readonly at: (px: number, py: number, size: number, t: number, depth: number) => readonly [number, number];
  /** World coordinate along the side at t = 0, and of the side's own line. */
  readonly along: (wx: number, wy: number) => number;
  readonly line: (wx: number, wy: number) => number;
};

const SIDES: readonly Side[] = [
  { ox: 0, oy: -1, at: (px, py, size, t, d) => [px + t * size, py + d], along: (wx) => wx, line: (_wx, wy) => wy },
  { ox: 0, oy: 1, at: (px, py, size, t, d) => [px + t * size, py + size - d], along: (wx) => wx, line: (_wx, wy) => wy + 1 },
  { ox: -1, oy: 0, at: (px, py, size, t, d) => [px + d, py + t * size], along: (_wx, wy) => wy, line: (wx) => wx },
  { ox: 1, oy: 0, at: (px, py, size, t, d) => [px + size - d, py + t * size], along: (_wx, wy) => wy, line: (wx) => wx + 1 }
];
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

const WAVE_STEPS = 8;
// Below this the border would be a sub-pixel smear; skip it (and its 8
// neighbour lookups per tile) entirely on a zoomed-out 2D map.
const EDGE_MIN_TILE_PX = 6;
// Below this tile size the band is a few pixels wide; a straight one reads better.
const EDGE_DETAIL_MIN_TILE_PX = 12;

const rgba = (hex: string, alpha: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

/** Parchment band depth in tiles at world position `a` along a fog edge on line `l`. */
export const unexploredBandDepth = (a: number, l: number): number =>
  0.72 + 0.06 * Math.sin(a * Math.PI * 2 + l * 1.7) + 0.035 * Math.sin(a * Math.PI * 4.6 + l * 0.9);

let hatchCache: { ctx: CanvasRenderingContext2D; pattern: CanvasPattern } | undefined;
const HATCH_PX = 32;
const hatchPatternFor = (ctx: CanvasRenderingContext2D): CanvasPattern | undefined => {
  if (hatchCache?.ctx === ctx) return hatchCache.pattern;
  if (typeof document === "undefined" || typeof ctx.createPattern !== "function") return undefined;
  const source = document.createElement("canvas");
  source.width = HATCH_PX;
  source.height = HATCH_PX;
  const sctx = source.getContext("2d");
  if (!sctx) return undefined;
  sctx.fillStyle = UNEXPLORED_PARCHMENT;
  sctx.fillRect(0, 0, HATCH_PX, HATCH_PX);
  sctx.strokeStyle = rgba(UNEXPLORED_PARCHMENT_INK, 0.7);
  sctx.lineWidth = 5;
  for (const shift of [-HATCH_PX, 0, HATCH_PX]) {
    sctx.beginPath();
    sctx.moveTo(shift, 0);
    sctx.lineTo(shift + HATCH_PX, HATCH_PX);
    sctx.stroke();
  }
  const pattern = ctx.createPattern(source, "repeat");
  if (!pattern) return undefined;
  hatchCache = { ctx, pattern };
  return pattern;
};

/** Whether (from the 8 neighbours) a fog tile is on the fog's first ring. */
export const isUnexploredCoastRing = (isExploredAt: (ox: number, oy: number) => boolean): boolean => {
  for (let k = 0; k < 9; k += 1) if (k !== 4 && isExploredAt((k % 3) - 1, Math.floor(k / 3) - 1)) return true;
  return false;
};

/** Whether a fog tile this large gets the coast treatment (else plain storm). */
export const unexploredCoastVisibleAt = (size: number): boolean => size >= EDGE_MIN_TILE_PX;

/**
 * Coast treatment for a first-ring fog tile at (wx, wy), drawn over its
 * already-drawn dimmed ground; neighbours at offset (ox, oy) may be
 * explored. Draws only inside this tile's square.
 */
export const drawUnexploredStormEdge2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  isExploredAt: (ox: number, oy: number) => boolean
): void => {
  const sides = SIDES.filter((side) => isExploredAt(side.ox, side.oy));
  const corners = CORNERS.filter(([ox, oy]) => isExploredAt(ox, oy) && !isExploredAt(ox, 0) && !isExploredAt(0, oy));
  const detailed = size >= EDGE_DETAIL_MIN_TILE_PX;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();

  // 1. See-through parchment wash.
  const hatch = detailed ? hatchPatternFor(ctx) : undefined;
  if (hatch && typeof hatch.setTransform === "function" && typeof DOMMatrix !== "undefined") {
    // 2.8 hatch lines per tile, anchored to the world like the storm.
    const scale = size / (2.8 * HATCH_PX);
    hatch.setTransform(new DOMMatrix([scale, 0, 0, scale, px - wx * size, py - wy * size]));
  }
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = hatch ?? UNEXPLORED_PARCHMENT;
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 1;

  // 2. Storm beyond every band: clip to the intersection of "past this
  // side's wave" / "outside this corner's arc" for each one.
  ctx.save();
  const edges: Array<() => void> = [];
  const rivets: Array<readonly [number, number]> = [];
  for (const side of sides) {
    const a0 = side.along(wx, wy);
    const l = side.line(wx, wy);
    const steps = detailed ? WAVE_STEPS : 1;
    const wave: Array<readonly [number, number]> = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      wave.push(side.at(px, py, size, t, size * (detailed ? unexploredBandDepth(a0 + t, l) : 0.72)));
    }
    const [fx1, fy1] = side.at(px, py, size, 1, size);
    const [fx0, fy0] = side.at(px, py, size, 0, size);
    ctx.beginPath();
    wave.forEach(([ex, ey], k) => (k === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey)));
    ctx.lineTo(fx1, fy1);
    ctx.lineTo(fx0, fy0);
    ctx.closePath();
    ctx.clip();
    edges.push(() => wave.forEach(([ex, ey], k) => (k === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey))));
    rivets.push(wave[0]!, wave[wave.length - 1]!);
  }
  for (const [ox, oy] of corners) {
    const cx = px + (ox > 0 ? size : 0);
    const cy = py + (oy > 0 ? size : 0);
    const r = size * 0.72;
    ctx.beginPath();
    ctx.rect(px, py, size, size);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip("evenodd");
    edges.push(() => ctx.arc(cx, cy, r, 0, Math.PI * 2));
    rivets.push([cx - Math.sign(ox) * r, cy], [cx, cy - Math.sign(oy) * r]);
  }
  setUnexploredStormFill(ctx, wx, wy, px, py, size);
  ctx.fillRect(px, py, size, size);

  // 3. Brass edge, still clipped to the storm region so each stroke shows
  // only its storm-side half (and never crosses another side's band): a
  // wide dark-brass stroke under a narrower bright one.
  const rimWidth = Math.max(1, size * 0.04);
  for (const [style, width] of [[UNEXPLORED_BRASS_DARK, rimWidth * 3.4], [UNEXPLORED_BRASS, rimWidth * 2]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const edge of edges) {
      ctx.beginPath();
      edge();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Rivets where the edge meets the tile's own edges (tile clip only).
  if (detailed) {
    ctx.fillStyle = UNEXPLORED_RIVET;
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx, ry, rimWidth * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};
