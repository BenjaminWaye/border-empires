// The world map's picture: one pixel per tile for the whole 640x320 world, built straight into an RGBA buffer
// (no per-tile canvas calls), then put on a cached offscreen canvas by client-world-map.ts.
//
// Only tiles the client already holds (state.tiles: in sight, or remembered under fog) are painted. Every other
// pixel is fog, even though worldgen could compute its terrain: the world map must not show ground the server
// never revealed to this player.

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type WorldMapTile = Pick<Tile, "x" | "y" | "terrain" | "ownerId" | "fogged">;

type Rgb = readonly [number, number, number];

/** Unexplored ground: dark, a shade lighter than the panel so the world's extent reads. */
export const WORLD_MAP_FOG_RGB: Rgb = [34, 30, 24];

const TERRAIN_RGB: Record<Tile["terrain"], Rgb> = {
  LAND: [77, 151, 106],
  MOUNTAIN: [139, 141, 146],
  COASTAL_SEA: [31, 110, 160],
  SEA: [11, 61, 145]
};

/** Remembered (fogged) tiles keep this share of their colour. */
const FOGGED_KEEP = 0.5;
/** How strongly the player's colour covers their own land. */
const OWN_TINT = 0.72;
const OWN_FALLBACK_RGB: Rgb = [255, 209, 102];

export const parseHexRgb = (hex: string): Rgb | undefined => {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const wrap = (value: number, size: number): number => {
  const r = Math.floor(value) % size;
  return r < 0 ? r + size : r;
};

/**
 * Fills `out` (width x height x 4 bytes, reused between builds when given) with the world picture and returns it.
 * Cost: one fill of the buffer plus one pass over the known tiles.
 */
export const buildWorldMapPixels = (args: {
  tiles: Iterable<WorldMapTile>;
  meId: string;
  ownColor: string;
  width?: number;
  height?: number;
  out?: Uint8ClampedArray;
}): Uint8ClampedArray => {
  const width = args.width ?? WORLD_WIDTH;
  const height = args.height ?? WORLD_HEIGHT;
  const size = width * height * 4;
  const out = args.out && args.out.length === size ? args.out : new Uint8ClampedArray(size);
  const [fr, fg, fb] = WORLD_MAP_FOG_RGB;
  for (let i = 0; i < size; i += 4) {
    out[i] = fr;
    out[i + 1] = fg;
    out[i + 2] = fb;
    out[i + 3] = 255;
  }
  const own = parseHexRgb(args.ownColor) ?? OWN_FALLBACK_RGB;
  for (const tile of args.tiles) {
    const base = TERRAIN_RGB[tile.terrain];
    if (!base) continue;
    let [r, g, b] = base;
    if (args.meId && tile.ownerId === args.meId) {
      r = r + (own[0] - r) * OWN_TINT;
      g = g + (own[1] - g) * OWN_TINT;
      b = b + (own[2] - b) * OWN_TINT;
    } else if (tile.fogged) {
      r *= FOGGED_KEEP;
      g *= FOGGED_KEEP;
      b *= FOGGED_KEEP;
    }
    const i = (wrap(tile.y, height) * width + wrap(tile.x, width)) * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
};
