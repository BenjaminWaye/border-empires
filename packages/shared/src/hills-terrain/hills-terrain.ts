/**
 * Hills-ness, like forest-ness, is purely procedural and fixed at world
 * generation — never mutated in play (unlike Terrain, which
 * CREATE_MOUNTAIN/REMOVE_MOUNTAIN can change on a live tile). Safe to treat
 * as a permanent property of the coordinate for caching purposes (see
 * vision-footprint-table.ts in apps/simulation).
 *
 * Mutually exclusive with forest-ness so a tile is never visually/mechanically
 * both a dark forest (vision-clamping) and a hill (vision-boosting).
 */

import { isHillsRegionAt } from "../worldgen/worldgen-hills.js";
import { isForestTileAt } from "../forest-terrain/forest-terrain.js";

export const isHillsTileAt = (x: number, y: number): boolean => isHillsRegionAt(x, y) && !isForestTileAt(x, y);
