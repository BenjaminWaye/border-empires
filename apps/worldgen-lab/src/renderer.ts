import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import type { WorkerResponse } from "./worker.js";

export type Layers = {
  biome: boolean;
  region: boolean;
  shade: boolean;
};

export type ViewConfig = {
  yOffset: number; // 0–449, scrolls the toroidal world vertically
};

const C_SEA: [number, number, number] = [15, 48, 100];
const C_COASTAL_SEA: [number, number, number] = [28, 90, 158];
const C_GRASS: [number, number, number] = [58, 105, 48];
const C_SAND: [number, number, number] = [185, 158, 62];
const C_COASTAL_SAND: [number, number, number] = [205, 182, 105];
const C_MOUNTAIN: [number, number, number] = [88, 82, 76];

const REGION_TINTS: Record<number, [number, number, number]> = {
  0: [90, 200, 70],   // FERTILE_PLAINS
  1: [20, 75, 20],    // DEEP_FOREST
  2: [130, 105, 75],  // BROKEN_HIGHLANDS
  3: [210, 175, 65],  // ANCIENT_HEARTLAND
  4: [155, 110, 205]  // CRYSTAL_WASTES
};

const mix = (a: number, b: number, t: number): number => Math.round(a * (1 - t) + b * t);

export const renderWorld = (
  canvas: HTMLCanvasElement,
  data: WorkerResponse,
  layers: Layers,
  view: ViewConfig
): void => {
  const maxDim = Math.min(canvas.width, canvas.height);
  const scale = Math.max(1, Math.floor(maxDim / Math.max(WORLD_WIDTH, WORLD_HEIGHT)));
  const drawW = WORLD_WIDTH * scale;
  const drawH = WORLD_HEIGHT * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = ctx.createImageData(drawW, drawH);
  const px = img.data;
  const yOff = ((Math.round(view.yOffset) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    // Toroidal vertical scroll: shift source row
    const srcY = (ty + yOff) % WORLD_HEIGHT;

    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const idx = srcY * WORLD_WIDTH + tx;
      const terrainCode = data.terrain[idx] ?? 0;

      let r: number, g: number, b: number;

      if (terrainCode === 1) {
        const biomeCode = data.biome[idx] ?? 0;
        let base: [number, number, number];
        if (layers.biome && biomeCode === 1) base = C_SAND;
        else if (layers.biome && biomeCode === 2) base = C_COASTAL_SAND;
        else base = C_GRASS;
        [r, g, b] = base;

        if (layers.region) {
          const regionCode = data.region[idx] ?? 0;
          const tint = REGION_TINTS[regionCode];
          if (tint) {
            r = mix(r, tint[0], 0.4);
            g = mix(g, tint[1], 0.4);
            b = mix(b, tint[2], 0.4);
          }
        }

        if (layers.shade && data.shade[idx] === 1) {
          r = Math.min(255, r + 18);
          g = Math.min(255, g + 18);
          b = Math.min(255, b + 12);
        }
      } else if (terrainCode === 2) {
        [r, g, b] = C_MOUNTAIN;
      } else if (terrainCode === 3) {
        [r, g, b] = C_COASTAL_SEA;
      } else {
        [r, g, b] = C_SEA;
      }

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const pxIdx = ((ty * scale + dy) * drawW + (tx * scale + dx)) * 4;
          px[pxIdx] = r;
          px[pxIdx + 1] = g;
          px[pxIdx + 2] = b;
          px[pxIdx + 3] = 255;
        }
      }
    }
  }

  canvas.width = drawW;
  canvas.height = drawH;
  ctx.putImageData(img, 0, 0);
};
