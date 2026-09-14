// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so adding the v8 biome textures (PLAINS/JUNGLE/MARSH/SNOW) didn't
// push that file over the limit.
import type { TerrainTextureId } from "./client-map-render-texture-id.js";

const TERRAIN_TEXTURE_SIZE = 64;

const textureCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = TERRAIN_TEXTURE_SIZE;
  canvas.height = TERRAIN_TEXTURE_SIZE;
  return canvas;
};
const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const tint = (r: number, g: number, b: number, delta: number): [number, number, number] => [
  clamp255(r + delta),
  clamp255(g + delta),
  clamp255(b + delta)
];

export const terrainTextures = new Map<TerrainTextureId, HTMLCanvasElement>();

const makeTerrainTexture = (
  base: [number, number, number],
  options: { grain: number; waveA?: number; waveB?: number; crack?: number; grass?: boolean; rock?: boolean; mottle?: boolean }
): HTMLCanvasElement => {
  const canvas = textureCanvas();
  const tctx = canvas.getContext("2d");
  if (!tctx) return canvas;
  const img = tctx.createImageData(TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  const data = img.data;
  const [br, bg, bb] = base;
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const index = (y * TERRAIN_TEXTURE_SIZE + x) * 4;
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
      if (options.mottle) {
        const blotch = Math.sin((x * 0.24 + y * 0.31) * 1.4) * Math.cos((x * 0.19 - y * 0.27) * 1.1);
        delta += blotch * 16;
      }
      const [r, g, b] = tint(br, bg, bb, delta);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);
  return canvas;
};

export const initTerrainTextures = (): void => {
  terrainTextures.set("SEA_DEEP", makeTerrainTexture([71, 128, 158], { grain: 9, waveA: 0.34, waveB: 0.28 }));
  terrainTextures.set("SEA_COAST", makeTerrainTexture([103, 154, 182], { grain: 8, waveA: 0.31, waveB: 0.26 }));
  terrainTextures.set("SAND", makeTerrainTexture([214, 184, 135], { grain: 11, waveA: 0.18, waveB: 0.14 }));
  terrainTextures.set("TUNDRA", makeTerrainTexture([172, 188, 182], { grain: 9, waveA: 0.10, waveB: 0.08 }));
  terrainTextures.set("GRASS_LIGHT", makeTerrainTexture([119, 142, 66], { grain: 10, grass: true }));
  terrainTextures.set("GRASS_LIGHTER", makeTerrainTexture([154, 184, 92], { grain: 10, grass: true }));
  terrainTextures.set("GRASS_DARK", makeTerrainTexture([94, 124, 48], { grain: 10, grass: true }));
  terrainTextures.set("PLAINS", makeTerrainTexture([189, 174, 92], { grain: 9, grass: true, waveA: 0.12, waveB: 0.1 }));
  terrainTextures.set("JUNGLE", makeTerrainTexture([46, 100, 45], { grain: 12, grass: true, mottle: true }));
  terrainTextures.set("MARSH", makeTerrainTexture([90, 108, 72], { grain: 8, mottle: true, waveA: 0.2, waveB: 0.16 }));
  terrainTextures.set("SNOW", makeTerrainTexture([235, 240, 245], { grain: 6, waveA: 0.08, waveB: 0.06 }));
  const mountain = makeTerrainTexture([126, 126, 129], { grain: 9, crack: 8, rock: true });
  const mctx = mountain.getContext("2d");
  if (mctx) {
    mctx.fillStyle = "rgba(78, 79, 82, 0.82)";
    mctx.beginPath();
    mctx.moveTo(8, 50);
    mctx.lineTo(28, 20);
    mctx.lineTo(46, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(97, 99, 103, 0.85)";
    mctx.beginPath();
    mctx.moveTo(20, 50);
    mctx.lineTo(41, 26);
    mctx.lineTo(56, 50);
    mctx.closePath();
    mctx.fill();
    mctx.fillStyle = "rgba(225, 228, 232, 0.75)";
    mctx.beginPath();
    mctx.moveTo(27, 23);
    mctx.lineTo(32, 31);
    mctx.lineTo(37, 23);
    mctx.closePath();
    mctx.fill();
  }
  terrainTextures.set("MOUNTAIN", mountain);
};
