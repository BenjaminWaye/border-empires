/**
 * Forest-ness is purely procedural (land biome + grass shade), fixed at
 * world generation and never mutated in play — unlike terrain (which
 * CREATE_MOUNTAIN/REMOVE_MOUNTAIN can change on a live tile). Safe to treat
 * as a permanent property of the coordinate for caching purposes (see
 * vision-footprint-table.ts in apps/simulation).
 */

import { grassShadeAt, landBiomeAt } from "../worldgen/worldgen.js";

export const isForestTileAt = (x: number, y: number): boolean => landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";
