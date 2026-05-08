import {
  CanvasTexture,
  LinearSRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace
} from "three";

const LEGACY_TEXTURE_SIZE = 64;
// Painterly textures span ~8 tiles per repeat (see TERRAIN_DETAIL_TILES_PER_REPEAT
// in the heightfield); 512² gives ~64px per tile of effective resolution which
// is plenty for the soft, blended Civ-style look without burning a second on
// startup generation.
const DETAIL_TEXTURE_SIZE = 512;
export const TERRAIN_DETAIL_TILES_PER_REPEAT = 8;

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const tint = (r: number, g: number, b: number, delta: number): [number, number, number] => [
  clamp255(r + delta),
  clamp255(g + delta),
  clamp255(b + delta)
];

export const legacy3DTerrainPalette = {
  grassLight: [119, 142, 66] as [number, number, number],
  grassDark: [94, 124, 48] as [number, number, number],
  sand: [214, 184, 135] as [number, number, number],
  seaDeep: [71, 128, 158] as [number, number, number],
  seaCoast: [103, 154, 182] as [number, number, number],
  gridLand: [73, 87, 70] as [number, number, number],
  gridSand: [108, 99, 78] as [number, number, number],
  gridSea: [79, 103, 118] as [number, number, number]
} as const;

export const textureEdgeBlendAt = (x: number, y: number, size: number, width: number): number => {
  const distanceToEdge = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (distanceToEdge >= width) return 0;
  return clamp255(((width - distanceToEdge) / Math.max(1, width)) * 255) / 255;
};

const mixChannel = (base: number, target: number, ratio: number): number =>
  clamp255(base * (1 - ratio) + target * ratio);

const createLegacyTerrainTexture = (
  base: [number, number, number],
  options: {
    grain: number;
    waveA?: number;
    waveB?: number;
    crack?: number;
    grass?: boolean;
    rock?: boolean;
    gridColor?: [number, number, number];
    gridWidth?: number;
    gridOpacity?: number;
  }
): CanvasTexture => {
  const size = LEGACY_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("failed to create legacy terrain texture canvas context");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const wave =
        Math.sin((x + y * 0.8) * (options.waveA ?? 0)) * 0.5 +
        Math.cos((y - x * 0.6) * (options.waveB ?? 0)) * 0.5;
      const grain =
        Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 0.5 +
        Math.sin((x * 93.17 - y * 51.11) * 0.021) * 0.5;
      let delta = grain * options.grain + wave * (options.waveA ? 10 : 0);
      if (options.crack) {
        const crack = Math.sin((x * 0.9 + y * 0.2) * 0.25) + Math.cos((y * 1.1 - x * 0.3) * 0.21);
        delta -= Math.max(0, crack) * options.crack;
      }
      if (options.grass) {
        const blade = Math.sin((x * 0.7 + y * 1.3) * 0.33) * 8 + Math.cos((x * 1.1 - y * 0.8) * 0.27) * 6;
        delta += blade * 0.25;
      }
      if (options.rock) {
        const pebble = Math.sin((x * 0.42 + y * 0.58) * 0.9) * Math.cos((x * 0.66 - y * 0.31) * 0.8);
        delta += pebble * 14;
      }
      let [r, g, b] = tint(br, bg, bb, delta);
      if (options.gridColor && options.gridOpacity && options.gridWidth) {
        const edgeBlend = textureEdgeBlendAt(x, y, size, options.gridWidth);
        const gridRatio = edgeBlend * options.gridOpacity;
        const [gr, gg, gb] = options.gridColor;
        r = mixChannel(r, gr, gridRatio);
        g = mixChannel(g, gg, gridRatio);
        b = mixChannel(b, gb, gridRatio);
      }
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
};

export const createLegacy3DTerrainTextures = (): {
  grassLightTexture: CanvasTexture;
  grassDarkTexture: CanvasTexture;
  sandTexture: CanvasTexture;
  seaDeepTexture: CanvasTexture;
  seaCoastTexture: CanvasTexture;
} => ({
  grassLightTexture: createLegacyTerrainTexture(legacy3DTerrainPalette.grassLight, {
    grain: 8,
    waveA: 0.22,
    waveB: 0.18,
    grass: true,
    gridColor: legacy3DTerrainPalette.gridLand,
    gridWidth: 2,
    gridOpacity: 0.52
  }),
  grassDarkTexture: createLegacyTerrainTexture(legacy3DTerrainPalette.grassDark, {
    grain: 8,
    waveA: 0.22,
    waveB: 0.18,
    grass: true,
    gridColor: legacy3DTerrainPalette.gridLand,
    gridWidth: 2,
    gridOpacity: 0.5
  }),
  sandTexture: createLegacyTerrainTexture(legacy3DTerrainPalette.sand, {
    grain: 11,
    waveA: 0.18,
    waveB: 0.14,
    gridColor: legacy3DTerrainPalette.gridSand,
    gridWidth: 2,
    gridOpacity: 0.42
  }),
  seaDeepTexture: createLegacyTerrainTexture(legacy3DTerrainPalette.seaDeep, {
    grain: 9,
    waveA: 0.34,
    waveB: 0.28,
    gridColor: legacy3DTerrainPalette.gridSea,
    gridWidth: 2,
    gridOpacity: 0.32
  }),
  seaCoastTexture: createLegacyTerrainTexture(legacy3DTerrainPalette.seaCoast, {
    grain: 8,
    waveA: 0.31,
    waveB: 0.26,
    gridColor: legacy3DTerrainPalette.gridSea,
    gridWidth: 2,
    gridOpacity: 0.28
  })
});

// ---------------------------------------------------------------------------
// Painterly biome detail texture suite (Civ-style, hand-painted look).
// ---------------------------------------------------------------------------

const periodicHash01 = (gx: number, gy: number, period: number, seed: number): number => {
  const wx = ((gx % period) + period) % period;
  const wy = ((gy % period) + period) % period;
  const h = ((wx * 0x27d4eb2d) ^ (wy * 0x165667b1) ^ (seed * 0x1b873593)) >>> 0;
  return h / 0xffffffff;
};

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const periodicValueNoise = (
  x: number,
  y: number,
  cell: number,
  period: number,
  seed: number
): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = x / cell - gx;
  const ty = y / cell - gy;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = periodicHash01(gx, gy, period, seed);
  const n10 = periodicHash01(gx + 1, gy, period, seed);
  const n01 = periodicHash01(gx, gy + 1, period, seed);
  const n11 = periodicHash01(gx + 1, gy + 1, period, seed);
  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
};

// Multi-octave value noise (FBM). Each octave doubles frequency and halves
// amplitude. Returned in [0, 1].
const fbm = (
  x: number,
  y: number,
  size: number,
  baseCell: number,
  octaves: number,
  seed: number
): number => {
  let amplitude = 0.5;
  let total = 0;
  let amplitudeSum = 0;
  let cell = baseCell;
  for (let o = 0; o < octaves; o += 1) {
    const period = Math.max(2, Math.round(size / cell));
    total += periodicValueNoise(x, y, cell, period, seed + o * 17) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    cell = Math.max(2, cell * 0.5);
  }
  return total / Math.max(amplitudeSum, 1e-6);
};

// Worley/cellular noise — distance to nearest jittered feature point on a
// cell grid. Returned ~0 at feature points, growing outward; clamped/scaled
// so the typical max is ~1.
const periodicCellular = (
  x: number,
  y: number,
  cell: number,
  period: number,
  seed: number
): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  let minDist2 = Infinity;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const ngx = gx + dx;
      const ngy = gy + dy;
      const fx = (ngx + periodicHash01(ngx * 7 + 1, ngy * 5 + 3, period, seed)) * cell;
      const fy = (ngy + periodicHash01(ngx * 3 + 5, ngy * 11 + 7, period, seed + 1)) * cell;
      const ex = x - fx;
      const ey = y - fy;
      const d2 = ex * ex + ey * ey;
      if (d2 < minDist2) minDist2 = d2;
    }
  }
  return Math.min(1, Math.sqrt(minDist2) / cell);
};

// Quad-tone palette mixer: blends among four colors driven by two noise
// channels in [0,1]. Picks the corner of a 2×2 palette grid via bilinear
// interpolation, giving painterly multi-tone fields.
type Palette4 = readonly [
  [number, number, number],
  [number, number, number],
  [number, number, number],
  [number, number, number]
];
const blendPalette4 = (
  palette: Palette4,
  u: number,
  v: number
): [number, number, number] => {
  const [c00, c10, c01, c11] = palette;
  const r = lerp(lerp(c00[0], c10[0], u), lerp(c01[0], c11[0], u), v);
  const g = lerp(lerp(c00[1], c10[1], u), lerp(c01[1], c11[1], u), v);
  const b = lerp(lerp(c00[2], c10[2], u), lerp(c01[2], c11[2], u), v);
  return [r, g, b];
};

// Cheerful sunny-meadow grass palette. All four corners are bright — a Civ-VI
// style sunny field never goes near dark moss, so the FBM blend stays in
// happy-green territory regardless of which palette corner dominates.
const GRASS_PALETTE: Palette4 = [
  [172, 206, 116], // bright spring green
  [192, 218, 132], // pale meadow
  [156, 192, 104], // fresh sage
  [206, 224, 142]  // sunlit highlight
] as const;

// Sun-bleached sand palette: every corner is a light, warm tan. No deep
// umber so the cellular blend can't muddy the surface.
const SAND_PALETTE: Palette4 = [
  [244, 226, 184], // cream
  [228, 200, 156], // bright tan
  [220, 194, 152], // beach sand
  [248, 232, 198]  // sun-bleached highlight
] as const;

export type TerrainDetailMaps = {
  readonly grassColorMap: CanvasTexture | null;
  readonly sandColorMap: CanvasTexture | null;
  readonly normalMap: CanvasTexture | null;
  readonly roughnessMap: CanvasTexture | null;
  readonly tilesPerRepeat: number;
  readonly dispose: () => void;
};

const createPainterlyBiomeTexture = (
  size: number,
  palette: Palette4,
  options: {
    seed: number;
    cellularCellSize: number;
    cellularStrength: number;
    bladeStripeFreq: number;
    bladeStripeStrength: number;
    rippleFreqX: number;
    rippleFreqY: number;
    rippleStrength: number;
    stampDensity: number;
    stampDarkness: number;
    stampRadius: number;
    grainStrength: number;
  }
): { canvas: HTMLCanvasElement; heights: Float32Array } => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("failed to create painterly biome texture canvas context");
  const image = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  // Pre-compute hashed stamp positions once. Stamps are placed on a coarse
  // jittered grid so they're spread out but irregular. stampDensity = 0
  // disables them entirely (used for grass — stamps were reading as dirt
  // patches rather than grass tufts at this scale).
  type Stamp = { cx: number; cy: number; strength: number; r: number };
  const stamps: Stamp[] = [];
  if (options.stampDensity > 0) {
    const stampGrid = Math.max(1, Math.round(options.stampDensity));
    const stampCellPx = size / stampGrid;
    for (let sy = 0; sy < stampGrid; sy += 1) {
      for (let sx = 0; sx < stampGrid; sx += 1) {
        const jitterX = periodicHash01(sx * 13 + 1, sy * 31 + 5, stampGrid, options.seed + 41);
        const jitterY = periodicHash01(sx * 23 + 7, sy * 41 + 3, stampGrid, options.seed + 67);
        const live = periodicHash01(sx * 7 + 11, sy * 19 + 13, stampGrid, options.seed + 89);
        // Drop ~30% of stamps so spacing is irregular.
        if (live < 0.3) continue;
        const cx = (sx + jitterX) * stampCellPx;
        const cy = (sy + jitterY) * stampCellPx;
        const strength =
          0.45 + 0.55 * periodicHash01(sx * 5 + 3, sy * 17 + 9, stampGrid, options.seed + 23);
        const r =
          options.stampRadius *
          (0.6 + 0.6 * periodicHash01(sx * 11 + 17, sy * 7, stampGrid, options.seed + 31));
        stamps.push({ cx, cy, strength, r });
      }
    }
  }

  const TWO_PI = 2 * Math.PI;
  const k = TWO_PI / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const px = idx * 4;

      // Two independent low-freq noise channels drive the 4-color palette
      // blend. Different cell sizes break up the shape so it doesn't look
      // checkerboarded.
      const u = clamp01(fbm(x, y, size, size / 4, 3, options.seed));
      const v = clamp01(fbm(x, y, size, size / 5, 3, options.seed + 137));
      let [r, g, b] = blendPalette4(palette, u, v);

      // Mid-frequency cellular patches: dark in patch interiors (close to
      // feature points), light at boundaries. Blended in subtly for organic
      // clumps without losing the base palette.
      const cellular = periodicCellular(
        x,
        y,
        options.cellularCellSize,
        Math.max(2, Math.round(size / options.cellularCellSize)),
        options.seed + 211
      );
      const cellularShade = (cellular - 0.5) * options.cellularStrength;
      r += cellularShade * 28;
      g += cellularShade * 26;
      b += cellularShade * 22;

      // Anisotropic blade/ripple pattern. Grass uses near-vertical stripes,
      // sand uses cross-hatched ripples — the magnitudes are tuned by the
      // caller via bladeStripe* and ripple*.
      const stripe =
        Math.sin(x * k * options.bladeStripeFreq + Math.sin(y * k * 4) * 1.1) *
        options.bladeStripeStrength;
      const ripple =
        Math.sin(y * k * options.rippleFreqY + Math.cos(x * k * options.rippleFreqX) * 1.4) *
        options.rippleStrength;
      const directional = stripe + ripple;
      r += directional * 8;
      g += directional * 9;
      b += directional * 6;

      // Stamps: at each stamp position, apply a soft radial darkening. For
      // grass these read as tufts, for sand as wet/erosion patches. Quadratic
      // falloff keeps the edges soft (no ringing).
      let stampShade = 0;
      for (let s = 0; s < stamps.length; s += 1) {
        const stamp = stamps[s]!;
        // Toroidal distance — closest of the 9 wrap copies — keeps stamps
        // seamless across the texture boundary.
        let dx = x - stamp.cx;
        let dy = y - stamp.cy;
        if (dx > size * 0.5) dx -= size;
        else if (dx < -size * 0.5) dx += size;
        if (dy > size * 0.5) dy -= size;
        else if (dy < -size * 0.5) dy += size;
        const d2 = dx * dx + dy * dy;
        const r2 = stamp.r * stamp.r;
        if (d2 < r2) {
          const t = 1 - d2 / r2;
          stampShade += t * t * stamp.strength;
        }
      }
      stampShade = Math.min(1, stampShade);
      const stampDelta = stampShade * options.stampDarkness;
      r -= stampDelta * 38;
      g -= stampDelta * 32;
      b -= stampDelta * 24;

      // High-frequency grain — keeps surfaces from looking plastic when the
      // camera zooms in. Tuned per-biome via grainStrength.
      const grain = (fbm(x, y, size, 8, 2, options.seed + 311) - 0.5) * options.grainStrength;
      r += grain * 22;
      g += grain * 20;
      b += grain * 18;

      image.data[px + 0] = clamp255(r);
      image.data[px + 1] = clamp255(g);
      image.data[px + 2] = clamp255(b);
      image.data[px + 3] = 255;

      // Composite scalar height for the shared normal/roughness pass. Pulls
      // from cellular (deep clumps), directional pattern, stamps (deeper
      // pits), and grain.
      heights[idx] =
        (cellular - 0.5) * 0.55 +
        directional * 0.05 +
        stampShade * -0.6 +
        grain * 0.15;
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, heights };
};

// Builds the painterly biome detail suite. Two full-color textures (grass +
// sand) carry the surface look, plus a shared normal/roughness pair. The
// heightfield material samples both color textures at the same UV and blends
// them by the vertex-color biome mask in onBeforeCompile, so each biome looks
// distinctly painterly rather than reading as the same noise tinted.
//
// UV scale: caller wraps so one full repeat spans TERRAIN_DETAIL_TILES_PER_REPEAT
// tiles. That kills the 1-tile repetition that made the procedural noise look
// like a barcode.
export const createTerrainDetailMaps = (): TerrainDetailMaps => {
  if (typeof document === "undefined") {
    return {
      grassColorMap: null,
      sandColorMap: null,
      normalMap: null,
      roughnessMap: null,
      tilesPerRepeat: TERRAIN_DETAIL_TILES_PER_REPEAT,
      dispose: (): void => {}
    };
  }

  const size = DETAIL_TEXTURE_SIZE;

  const grass = createPainterlyBiomeTexture(size, GRASS_PALETTE, {
    seed: 7,
    // Smaller cells + low strength → fine, soft tonal variation across the
    // surface rather than visible blotches.
    cellularCellSize: size / 24,
    cellularStrength: 0.18,
    // Tight, fine vertical stripes so the texture reads as grass blades up
    // close. Strong enough to see, fine enough not to look stripey.
    bladeStripeFreq: 38,
    bladeStripeStrength: 0.7,
    rippleFreqX: 0,
    rippleFreqY: 0,
    rippleStrength: 0,
    // No stamps on grass — stamps at this scale read as dirt patches and
    // muddy the cheerful color. Grass relies on palette + cellular + blades.
    stampDensity: 0,
    stampDarkness: 0,
    stampRadius: 0,
    grainStrength: 0.4
  });

  const sand = createPainterlyBiomeTexture(size, SAND_PALETTE, {
    seed: 53,
    cellularCellSize: size / 10,
    cellularStrength: 0.28,
    bladeStripeFreq: 0,
    bladeStripeStrength: 0,
    rippleFreqX: 5,
    rippleFreqY: 9,
    rippleStrength: 0.42,
    // Soft, sparse pebble accents — sand keeps a hint of stamp variation
    // since the sun-bleached palette can absorb light darkening without
    // looking muddy.
    stampDensity: 8,
    stampDarkness: 0.28,
    stampRadius: size / 22,
    grainStrength: 0.55
  });

  // Normal + roughness use a composite of grass and sand height fields so a
  // single shared pair works for both biomes (the fragment shader applies
  // them after the color blend). Averaging keeps the lighting subtle on both
  // sides; a per-biome split here would burden VRAM with little extra payoff.
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  normalCanvas.width = normalCanvas.height = size;
  roughnessCanvas.width = roughnessCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");
  const roughnessCtx = roughnessCanvas.getContext("2d");
  if (!normalCtx || !roughnessCtx) {
    throw new Error("failed to create normal/roughness canvas contexts");
  }
  const normalImage = normalCtx.createImageData(size, size);
  const roughnessImage = roughnessCtx.createImageData(size, size);

  const composite = new Float32Array(size * size);
  for (let i = 0; i < composite.length; i += 1) {
    composite[i] = (grass.heights[i]! + sand.heights[i]!) * 0.5;
  }

  const normalStrength = 3.6;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const px = idx * 4;
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const hL = composite[y * size + xm]!;
      const hR = composite[y * size + xp]!;
      const hD = composite[ym * size + x]!;
      const hU = composite[yp * size + x]!;
      const nx = -(hR - hL) * normalStrength;
      const ny = -(hU - hD) * normalStrength;
      const nz = 1;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      normalImage.data[px + 0] = clamp255((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 1] = clamp255((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 2] = clamp255((nz * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 3] = 255;

      // Pits and stamp interiors read rougher (darker). Surface ridges keep
      // a hint of sheen so the warm sun catches them.
      const h = composite[idx]!;
      const roughness = clamp01(0.86 - h * 0.22);
      const roughnessByte = clamp255(roughness * 255);
      roughnessImage.data[px + 0] = roughnessByte;
      roughnessImage.data[px + 1] = roughnessByte;
      roughnessImage.data[px + 2] = roughnessByte;
      roughnessImage.data[px + 3] = 255;
    }
  }

  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const grassColorMap = new CanvasTexture(grass.canvas);
  grassColorMap.colorSpace = SRGBColorSpace;
  grassColorMap.wrapS = RepeatWrapping;
  grassColorMap.wrapT = RepeatWrapping;
  // repeat = 1/N → the heightfield's per-vertex world-coord UV samples one
  // full texture per N tiles. The heightfield wires its vMapUv through this
  // texture's matrix so the sand sampler in onBeforeCompile shares the scale.
  grassColorMap.repeat.set(1 / TERRAIN_DETAIL_TILES_PER_REPEAT, 1 / TERRAIN_DETAIL_TILES_PER_REPEAT);
  grassColorMap.anisotropy = 8;
  grassColorMap.needsUpdate = true;

  const sandColorMap = new CanvasTexture(sand.canvas);
  sandColorMap.colorSpace = SRGBColorSpace;
  sandColorMap.wrapS = RepeatWrapping;
  sandColorMap.wrapT = RepeatWrapping;
  sandColorMap.repeat.set(1 / TERRAIN_DETAIL_TILES_PER_REPEAT, 1 / TERRAIN_DETAIL_TILES_PER_REPEAT);
  sandColorMap.anisotropy = 8;
  sandColorMap.needsUpdate = true;

  const normalMap = new CanvasTexture(normalCanvas);
  normalMap.colorSpace = LinearSRGBColorSpace;
  normalMap.wrapS = RepeatWrapping;
  normalMap.wrapT = RepeatWrapping;
  normalMap.repeat.set(1 / TERRAIN_DETAIL_TILES_PER_REPEAT, 1 / TERRAIN_DETAIL_TILES_PER_REPEAT);
  normalMap.anisotropy = 8;
  normalMap.needsUpdate = true;

  const roughnessMap = new CanvasTexture(roughnessCanvas);
  roughnessMap.colorSpace = NoColorSpace;
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.repeat.set(1 / TERRAIN_DETAIL_TILES_PER_REPEAT, 1 / TERRAIN_DETAIL_TILES_PER_REPEAT);
  roughnessMap.anisotropy = 8;
  roughnessMap.needsUpdate = true;

  const dispose = (): void => {
    grassColorMap.dispose();
    sandColorMap.dispose();
    normalMap.dispose();
    roughnessMap.dispose();
  };

  return {
    grassColorMap,
    sandColorMap,
    normalMap,
    roughnessMap,
    tilesPerRepeat: TERRAIN_DETAIL_TILES_PER_REPEAT,
    dispose
  };
};
