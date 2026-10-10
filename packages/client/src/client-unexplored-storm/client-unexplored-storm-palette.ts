// Unexplored territory reads as a hatched storm-cloud bank, like weather
// drawn on an old map, instead of a black void; remembered tiles read as an
// old survey print (see FOGGED_PRINT_* below). Explored tiles bordering it
// fade through a parchment band (the "sketched but not yet surveyed" edge)
// behind a pale foam rim. Shared by both map renderers so the 2D canvas
// fallback and the true-3D view look like the same weather.
export const UNEXPLORED_STORM_DARK = "#3b4144";
export const UNEXPLORED_STORM_MID = "#545b5f";
export const UNEXPLORED_STORM_LIGHT = "#6f777b";
export const UNEXPLORED_STORM_INK = "#2a2f31";
export const UNEXPLORED_PARCHMENT = "#dccfa4";
export const UNEXPLORED_PARCHMENT_INK = "#9d8f66";
// Brass survey edge where the parchment coast meets the storm (replaced a
// pale foam rim): a bright brass line, a darker brass edge on the storm
// side, and rivet dots where it crosses tile edges.
export const UNEXPLORED_BRASS = "#d8b25a";
export const UNEXPLORED_BRASS_DARK = "#6e4e1e";
export const UNEXPLORED_RIVET = "#f6dc94";

// Remembered ("fogged") tiles -- explored but not currently in sight -- read
// as an aged survey print rather than a dark hole. In 3D, land gets a
// normal-blend wash of FOGGED_PRINT_SEPIA (pulling every colour toward one
// tan compresses saturation and contrast, like a faded print; a multiply
// could only darken), trees and peaks are multiplied by
// FOGGED_PRINT_FEATURE_TINT, and water is pulled toward FOGGED_PRINT_WATER.
export const FOGGED_PRINT_SEPIA = "#8a7458";
export const FOGGED_PRINT_WASH_OPACITY = 0.6;
export const FOGGED_PRINT_FEATURE_TINT = "#d8b48a";
export const FOGGED_PRINT_WATER = "#5d6e70";
// 2D only: the warm multiply that ages a remembered tile after its "color"
// blend (client-map-render-2d-tile-ground.ts).
export const FOGGED_PRINT_LAND_AGE = "#cbb391";
export const FOGGED_PRINT_WATER_AGE = "#c2c4bd";
