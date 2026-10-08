// 2D relief-renderer tile geometry, split out of client-map-render.ts so
// modules that only need tile heights (e.g. the live ownership tint) don't
// pull in that module's image loading.
import { isCanvasReliefRendererMode } from "../client-renderer-mode.js";
import type { Tile } from "../client-types.js";

export const useTerrainReliefRenderer = isCanvasReliefRendererMode;

export const terrainReliefPx = (wx: number, wy: number, terrain: Tile["terrain"], size: number): number => {
  if (terrain === "SEA" || terrain === "COASTAL_SEA") return Math.max(1, Math.floor(size * 0.08));
  if (terrain === "MOUNTAIN") return Math.max(3, Math.floor(size * 0.3));
  const groupedNoise = Math.abs(Math.sin(wx * 0.77 + wy * 1.13) + Math.cos(wx * 0.51 - wy * 0.89)) * 0.5;
  const base = size * (0.15 + groupedNoise * 0.11);
  return Math.max(2, Math.floor(base));
};
