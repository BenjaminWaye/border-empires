import {
  CanvasTexture,
  LinearSRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace
} from "three";

const LEGACY_TEXTURE_SIZE = 64;
const DETAIL_TEXTURE_SIZE = 256;

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

// Periodic hash used as the seed for a tiling value-noise field. Wrapping the
// integer cell index by `period` before hashing makes the noise wrap exactly
// at the texture boundary so one tile of detail repeats seamlessly to the
// next without visible seams.
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

const fbm = (x: number, y: number, size: number, octaves: number, seed: number): number => {
  let amplitude = 0.5;
  let total = 0;
  let amplitudeSum = 0;
  let cell = size / 4;
  for (let o = 0; o < octaves; o += 1) {
    const period = Math.max(2, Math.round(size / cell));
    total += periodicValueNoise(x, y, cell, period, seed + o * 17) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    cell = Math.max(2, cell * 0.5);
  }
  return total / Math.max(amplitudeSum, 1e-6);
};

// Soft tile-edge ambient occlusion. Fades from 1.0 at center to ~0.62 at the
// extreme corner, with a wider footprint than the legacy gridline so adjacent
// tiles get a believable shadowed seam without an obvious painted line.
const tileEdgeAO = (x: number, y: number, size: number): number => {
  const half = size * 0.5;
  const dx = (x - half + 0.5) / half;
  const dy = (y - half + 0.5) / half;
  const distFromCenter = Math.max(Math.abs(dx), Math.abs(dy));
  const ao = 1 - smoothstep(clamp01((distFromCenter - 0.62) / 0.38)) * 0.38;
  return ao;
};

// Anisotropic blade pattern: vertical-ish stripes with a small horizontal
// jitter so the texture reads as bent grass rather than a barcode. The
// frequencies chosen are integer multiples of (2π / size) so the pattern
// tiles perfectly with the noise.
const grassBladePattern = (x: number, y: number, size: number): number => {
  const k = (2 * Math.PI) / size;
  const stripe = Math.sin(x * k * 14 + Math.sin(y * k * 4) * 1.2);
  const tip = Math.cos(x * k * 28 + y * k * 6) * 0.35;
  return stripe * 0.5 + tip * 0.5;
};

// Sand pattern: lower-frequency cross-ripples (dunes) plus a peppered
// high-frequency speckle for grain. Same tile-friendly trig.
const sandRipplePattern = (x: number, y: number, size: number): number => {
  const k = (2 * Math.PI) / size;
  const ripple = Math.sin(y * k * 6 + Math.cos(x * k * 3) * 1.4);
  const grain = Math.sin(x * k * 36) * Math.cos(y * k * 36) * 0.45;
  return ripple * 0.55 + grain * 0.55;
};

export type TerrainDetailMaps = {
  readonly colorMap: CanvasTexture | null;
  readonly normalMap: CanvasTexture | null;
  readonly roughnessMap: CanvasTexture | null;
  readonly dispose: () => void;
};

// Builds a per-tile detail set at DETAIL_TEXTURE_SIZE that the heightfield
// material samples once per tile (UVs == world coords, RepeatWrapping). The
// color map packs three biome-relevant signals so a single shader injection
// in client-map-3d-heightfield can blend the right detail per biome:
//   R = grass detail (luminance variation around 0.5, anisotropic blades)
//   G = sand detail  (luminance variation around 0.5, dune ripples + grain)
//   B = tile-edge AO (1.0 at center, ~0.62 at corner)
// Normals are derived from a composite height field of the same patterns so
// the lit highlights line up with the visible grain. Roughness varies in
// lockstep (deeper grain = rougher) so the warm sun picks up texture instead
// of flat-shading the surface.
export const createTerrainDetailMaps = (): TerrainDetailMaps => {
  // Heightfield unit tests run under node where document is undefined. The
  // material falls back gracefully to vertex-color-only shading without the
  // detail maps, which is fine for the geometry assertions those tests make.
  if (typeof document === "undefined") {
    return { colorMap: null, normalMap: null, roughnessMap: null, dispose: (): void => {} };
  }
  const size = DETAIL_TEXTURE_SIZE;
  const colorCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = size;
  normalCanvas.width = normalCanvas.height = size;
  roughnessCanvas.width = roughnessCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");
  const normalCtx = normalCanvas.getContext("2d");
  const roughnessCtx = roughnessCanvas.getContext("2d");
  if (!colorCtx || !normalCtx || !roughnessCtx) {
    throw new Error("failed to create detail texture canvas contexts");
  }
  const colorImage = colorCtx.createImageData(size, size);
  const normalImage = normalCtx.createImageData(size, size);
  const roughnessImage = roughnessCtx.createImageData(size, size);

  // Composite height field used by both the color luminance term and the
  // Sobel normal pass so lighting matches the visible grain pattern.
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const baseFbm = fbm(x, y, size, 4, 7) * 1.2 - 0.6;
      const blades = grassBladePattern(x, y, size) * 0.45;
      const ripples = sandRipplePattern(x, y, size) * 0.45;
      heights[idx] = baseFbm * 0.55 + blades * 0.5 + ripples * 0.5;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const px = idx * 4;

      const grassLuma = clamp01(
        0.5 + grassBladePattern(x, y, size) * 0.22 + (fbm(x, y, size, 3, 11) - 0.5) * 0.32
      );
      const sandLuma = clamp01(
        0.5 + sandRipplePattern(x, y, size) * 0.20 + (fbm(x, y, size, 3, 19) - 0.5) * 0.28
      );
      const ao = tileEdgeAO(x, y, size);

      colorImage.data[px + 0] = clamp255(grassLuma * 255);
      colorImage.data[px + 1] = clamp255(sandLuma * 255);
      colorImage.data[px + 2] = clamp255(ao * 255);
      colorImage.data[px + 3] = 255;

      // Tangent-space normal via Sobel on the seamless height field.
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const hL = heights[y * size + xm]!;
      const hR = heights[y * size + xp]!;
      const hD = heights[ym * size + x]!;
      const hU = heights[yp * size + x]!;
      const strength = 2.4;
      const nx = -(hR - hL) * strength;
      const ny = -(hU - hD) * strength;
      const nz = 1;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      normalImage.data[px + 0] = clamp255((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 1] = clamp255((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 2] = clamp255((nz * invLen * 0.5 + 0.5) * 255);
      normalImage.data[px + 3] = 255;

      // Deeper grain pits read as rougher; sun-lit ridges keep a tiny sheen.
      const heightHere = heights[idx]!;
      const roughness = clamp01(0.88 - heightHere * 0.18 + (fbm(x, y, size, 2, 23) - 0.5) * 0.06);
      const roughnessByte = clamp255(roughness * 255);
      roughnessImage.data[px + 0] = roughnessByte;
      roughnessImage.data[px + 1] = roughnessByte;
      roughnessImage.data[px + 2] = roughnessByte;
      roughnessImage.data[px + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const colorMap = new CanvasTexture(colorCanvas);
  // Color map carries packed data, not viewable color — sampling stays linear
  // so the shader math (R/G blend + B AO) isn't sRGB-decoded.
  colorMap.colorSpace = NoColorSpace;
  colorMap.wrapS = RepeatWrapping;
  colorMap.wrapT = RepeatWrapping;
  colorMap.repeat.set(1, 1);
  colorMap.anisotropy = 4;
  colorMap.needsUpdate = true;

  const normalMap = new CanvasTexture(normalCanvas);
  normalMap.colorSpace = LinearSRGBColorSpace;
  normalMap.wrapS = RepeatWrapping;
  normalMap.wrapT = RepeatWrapping;
  normalMap.repeat.set(1, 1);
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new CanvasTexture(roughnessCanvas);
  roughnessMap.colorSpace = NoColorSpace;
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.repeat.set(1, 1);
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  const dispose = (): void => {
    colorMap.dispose();
    normalMap.dispose();
    roughnessMap.dispose();
  };

  return { colorMap, normalMap, roughnessMap, dispose };
};

