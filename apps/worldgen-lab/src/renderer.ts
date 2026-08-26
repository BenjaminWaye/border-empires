import { WORLD_WIDTH, WORLD_HEIGHT, type NaturalWonderType } from "@border-empires/shared";
import type { WorkerResponse } from "./worker.js";

export type Layers = {
  biome: boolean;
  region: boolean;
  shade: boolean;
  hills: boolean;
  resources: boolean;
  towns: boolean;
  docks: boolean;
  wonders: boolean;
  spawnSites: boolean;
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
const C_POLAR: [number, number, number] = [210, 225, 238]; // snow/ice color for polar band
const POLAR_BAND = 15; // must match worldgen.ts POLAR_BAND constant

const C_HILLS: [number, number, number] = [150, 120, 55]; // tan/khaki tint for isHillsTileAt() tiles

const REGION_TINTS: Record<number, [number, number, number]> = {
  0: [90, 200, 70],   // FERTILE_PLAINS
  1: [20, 75, 20],    // DEEP_FOREST
  2: [130, 105, 75],  // BROKEN_HIGHLANDS
  3: [210, 175, 65],  // ANCIENT_HEARTLAND
  4: [155, 110, 205]  // CRYSTAL_WASTES
};

// resourceLayer values: 1=UMBRITE 2=FARM 3=GEMS 4=TITANIUM 5=FISH
const RESOURCE_TINT: Array<[number, number, number]> = [
  [0, 0, 0],        // 0 none
  [77, 42, 134],    // 1 UMBRITE – black-purple
  [80, 210, 80],    // 2 FARM – bright green
  [170, 90, 210],   // 3 GEMS – purple
  [201, 201, 201],  // 4 TITANIUM – neutral gray
  [60, 190, 230],   // 5 FISH – cyan
];

const mix = (a: number, b: number, t: number): number => Math.round(a * (1 - t) + b * t);

// One distinct color per NaturalWonderType, shared with main.ts's legend/list
// so the swatch next to a wonder's name always matches its map marker.
export const WONDER_COLORS: Record<NaturalWonderType, [number, number, number]> = {
  FOUNDRY_HEART: [255, 80, 48],
  CONSCRIPTION_ENGINE: [138, 138, 138],
  WATCHTOWER_ENGINE: [64, 224, 208],
  BASTION_FRAME: [64, 96, 192],
  CARTOGRAPHERS_LENS: [255, 215, 0],
  DEEPWATER_ENGINE: [0, 191, 255],
  WARPRESS: [208, 32, 32],
  QUICKFORGE: [255, 140, 0],
  CALCULATING_ENGINE: [160, 255, 64]
};

// Draw a square marker into ImageData around world tile (wx, wy).
// halfw = half-width in pixels (marker is 2*halfw+1 square).
const drawMarker = (
  px: Uint8ClampedArray,
  wx: number, wy: number,
  colR: number, colG: number, colB: number,
  borderR: number, borderG: number, borderB: number,
  halfw: number,
  scale: number, drawW: number, drawH: number, yOff: number
): void => {
  const dispY = ((wy - yOff + WORLD_HEIGHT) % WORLD_HEIGHT);
  const cx = wx * scale + Math.floor(scale / 2);
  const cy = dispY * scale + Math.floor(scale / 2);
  for (let dy = -halfw; dy <= halfw; dy++) {
    for (let dx = -halfw; dx <= halfw; dx++) {
      const px0 = cx + dx;
      const py0 = cy + dy;
      if (px0 < 0 || px0 >= drawW || py0 < 0 || py0 >= drawH) continue;
      const border = Math.abs(dx) === halfw || Math.abs(dy) === halfw;
      const i = (py0 * drawW + px0) * 4;
      px[i]     = border ? borderR : colR;
      px[i + 1] = border ? borderG : colG;
      px[i + 2] = border ? borderB : colB;
      px[i + 3] = 255;
    }
  }
};

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

        if (layers.hills && data.hills[idx] === 1) {
          r = mix(r, C_HILLS[0], 0.45);
          g = mix(g, C_HILLS[1], 0.45);
          b = mix(b, C_HILLS[2], 0.45);
        }

        if (layers.resources) {
          const resCode = data.resourceLayer[idx] ?? 0;
          if (resCode > 0) {
            const tc = RESOURCE_TINT[resCode]!;
            r = mix(r, tc[0], 0.55);
            g = mix(g, tc[1], 0.55);
            b = mix(b, tc[2], 0.55);
          }
        }
      } else if (terrainCode === 2) {
        const isPolar = srcY < POLAR_BAND || srcY >= WORLD_HEIGHT - POLAR_BAND;
        [r, g, b] = isPolar ? C_POLAR : C_MOUNTAIN;
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

  // Dock markers (cyan) — drawn before town markers so towns appear on top
  if (layers.docks) {
    for (const flatIdx of data.dockSiteIndices) {
      const wx = flatIdx % WORLD_WIDTH;
      const wy = Math.floor(flatIdx / WORLD_WIDTH);
      drawMarker(px, wx, wy, 0, 200, 255, 0, 80, 140, 4, scale, drawW, drawH, yOff);
    }
  }

  // Fair-spawn-site markers (magenta, white border) — drawn before town
  // markers so a town stays legible where a spawn site happens to sit right
  // next to one.
  if (layers.spawnSites) {
    for (const flatIdx of data.spawnSiteIndices) {
      const wx = flatIdx % WORLD_WIDTH;
      const wy = Math.floor(flatIdx / WORLD_WIDTH);
      drawMarker(px, wx, wy, 255, 0, 180, 255, 255, 255, 2, scale, drawW, drawH, yOff);
    }
  }

  // Town markers (white/yellow)
  if (layers.towns) {
    for (const flatIdx of data.townIndices) {
      const wx = flatIdx % WORLD_WIDTH;
      const wy = Math.floor(flatIdx / WORLD_WIDTH);
      drawMarker(px, wx, wy, 255, 240, 80, 80, 60, 0, 3, scale, drawW, drawH, yOff);
    }
  }

  // Natural Wonder markers — larger than town/dock markers and black-bordered
  // so all 9 distinct colors stay legible against any terrain underneath.
  if (layers.wonders) {
    for (const wonder of data.wonders) {
      const wx = wonder.index % WORLD_WIDTH;
      const wy = Math.floor(wonder.index / WORLD_WIDTH);
      const [r, g, b] = WONDER_COLORS[wonder.type] ?? [255, 255, 255];
      drawMarker(px, wx, wy, r, g, b, 0, 0, 0, 6, scale, drawW, drawH, yOff);
    }
  }

  canvas.width = drawW;
  canvas.height = drawH;
  ctx.putImageData(img, 0, 0);
};
