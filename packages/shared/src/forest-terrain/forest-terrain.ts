/**
 * Forest-ness is purely procedural (land biome + grass shade), fixed at
 * world generation and never mutated in play — unlike terrain (which
 * CREATE_MOUNTAIN/REMOVE_MOUNTAIN can change on a live tile). Safe to treat
 * as a permanent property of the coordinate for caching purposes (see
 * vision-footprint-table.ts in apps/simulation).
 */

import { grassShadeAt, landBiomeAt } from "../worldgen/worldgen.js";
import { worldgenVersion } from "../worldgen/worldgen-version.js";
import { isTropicalLatitudeAt } from "../worldgen/worldgen-latitude.js";
import { WORLD_HEIGHT } from "../config.js";
import { wrapY } from "../math/math.js";

export const isForestTileAt = (x: number, y: number): boolean => landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

// A forest tile that also sits in the equatorial wet belt (v7+, see
// worldgen-latitude.ts) -- renders as a distinct tropical/jungle tree
// variant instead of the regular pine/spruce forest. Purely cosmetic: game
// mechanics (FARM/UMBRITE placement, etc.) still key off isForestTileAt
// alone.
export const isTropicalForestTileAt = (x: number, y: number): boolean =>
  worldgenVersion() >= 7 && isForestTileAt(x, y) && isTropicalLatitudeAt(wrapY(y, WORLD_HEIGHT));
