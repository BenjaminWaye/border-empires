// The world map's picture: one pixel per tile for the whole 640x320 world, built straight into an RGBA buffer
// (no per-tile canvas calls), then put on a cached offscreen canvas by client-world-map.ts.
//
// Only explored ground (state.discoveredTiles, the same gate the main map and minimap use) is painted. Explored
// tiles the client still holds (state.tiles) show their real state; explored tiles it no longer holds (out of
// sight after a reload) show dimmed worldgen terrain, as on the minimap. Every other pixel is fog, even though
// worldgen could compute its terrain, and a held tile outside discoveredTiles stays fog too: the world map must
// not show ground the player has not explored.

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

type Discovered = { has: (key: string) => boolean };

const tileKey = (x: number, y: number): string => `${x},${y}`;

const wrap = (value: number, size: number): number => {
  const r = Math.floor(value) % size;
  return r < 0 ? r + size : r;
};

/**
 * The explored-ground layer: fog everywhere, plus dimmed worldgen terrain on every explored tile. It only changes
 * when discoveredTiles grows, so client-world-map.ts caches it and rebuilds it only then.
 * Cost: one fill of the buffer plus one pass over the explored keys ("x,y"), not over the whole world.
 */
export const buildDiscoveredLayer = (args: {
  discovered: Iterable<string>;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  width?: number;
  height?: number;
  out?: Uint8ClampedArray | undefined;
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
  for (const key of args.discovered) {
    const comma = key.indexOf(",");
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    if (comma < 0 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) continue;
    const base = TERRAIN_RGB[args.terrainAt(x, y)];
    if (!base) continue;
    const i = (y * width + x) * 4;
    out[i] = base[0] * FOGGED_KEEP;
    out[i + 1] = base[1] * FOGGED_KEEP;
    out[i + 2] = base[2] * FOGGED_KEEP;
  }
  return out;
};

/**
 * Fills `out` (width x height x 4 bytes, reused between builds when given) with the world picture and returns it.
 * Cost: one copy of the layer (or fill) plus one pass over the known tiles.
 */
export const buildWorldMapPixels = (args: {
  tiles: Iterable<WorldMapTile>;
  discovered: Discovered;
  /** The explored-ground layer from buildDiscoveredLayer; without it the picture starts as all fog. */
  layer?: Uint8ClampedArray | undefined;
  meId: string;
  ownColor: string;
  width?: number;
  height?: number;
  out?: Uint8ClampedArray | undefined;
}): Uint8ClampedArray => {
  const width = args.width ?? WORLD_WIDTH;
  const height = args.height ?? WORLD_HEIGHT;
  const size = width * height * 4;
  const out = args.out && args.out.length === size ? args.out : new Uint8ClampedArray(size);
  if (args.layer && args.layer.length === size) out.set(args.layer);
  else {
    const [fr, fg, fb] = WORLD_MAP_FOG_RGB;
    for (let i = 0; i < size; i += 4) {
      out[i] = fr;
      out[i + 1] = fg;
      out[i + 2] = fb;
      out[i + 3] = 255;
    }
  }
  const own = parseHexRgb(args.ownColor) ?? OWN_FALLBACK_RGB;
  for (const tile of args.tiles) {
    const base = TERRAIN_RGB[tile.terrain];
    if (!base) continue;
    const x = wrap(tile.x, width);
    const y = wrap(tile.y, height);
    // A tile the client holds but the player never explored (e.g. made up from a combat result) stays fog.
    if (!args.discovered.has(tileKey(x, y))) continue;
    let [r, g, b] = base;
    // As on the minimap, a remembered (fogged) tile gets no owner tint: its last-known owner may be stale.
    if (args.meId && tile.ownerId === args.meId && !tile.fogged) {
      r = r + (own[0] - r) * OWN_TINT;
      g = g + (own[1] - g) * OWN_TINT;
      b = b + (own[2] - b) * OWN_TINT;
    } else if (tile.fogged) {
      r *= FOGGED_KEEP;
      g *= FOGGED_KEEP;
      b *= FOGGED_KEEP;
    }
    const i = (y * width + x) * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
};
