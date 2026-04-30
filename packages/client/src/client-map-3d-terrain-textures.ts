import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const LEGACY_TEXTURE_SIZE = 64;

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

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
