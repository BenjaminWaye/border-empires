/**
 * Forest-ness is procedural (land biome + grass shade), fixed at world
 * generation with one exception: an AFC landing clears forest from its 3x3
 * footprint (see forest-clearing.ts), which bumps forestClearingEpoch() so
 * caches that otherwise treat forest as permanent (vision-footprint-table.ts
 * in apps/simulation) can invalidate.
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
export const isTropicalForestTileAt = (x: number, y: number): boolean => isForestTileAt(x, y) && isTropicalForestLatitudeAt(y);

// The latitude half of isTropicalForestTileAt, for a renderer that already
// knows the tile draws as forest -- including footprint forest an AFC landing
// cleared but that is held on screen until touchdown, which isForestTileAt no
// longer reports (client-afc-join-drop-state.ts).
export const isTropicalForestLatitudeAt = (y: number): boolean =>
  worldgenVersion() >= 7 && isTropicalLatitudeAt(wrapY(y, WORLD_HEIGHT));
