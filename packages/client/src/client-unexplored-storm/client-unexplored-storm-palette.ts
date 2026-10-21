// Unexplored territory reads as a streaked storm-cloud bank, like weather
// drawn on an old map, instead of a black void; remembered tiles sit under a
// drifting mist (see FOGGED_* below). The first ring of unexplored
// tiles shows a glimpse of its ground (~a quarter tile) before a brass
// survey edge, then the storm. Shared
// by both map renderers so the 2D canvas fallback and the true-3D view look
// like the same weather.
// "Lantern glass": the storm is warm iron smoke in the HUD's own iron /
// gunmetal tones (client-steampunk-theme-style.css --sp-iron-*, --sp-
// gunmetal-*), lit warm along the frontier as if by brass lanterns.
export const UNEXPLORED_STORM_DARK = "#241c14";
export const UNEXPLORED_STORM_MID = "#3a3026";
export const UNEXPLORED_STORM_LIGHT = "#57493a";
export const UNEXPLORED_STORM_INK = "#120d08";
// Lantern light glowing in the storm just behind the brass edge, and the
// flash when the clouds roll back off newly explored tiles.
export const UNEXPLORED_LANTERN = "#d9852e";
// Brass survey edge where the fog ring's clear ground meets the storm: a
// bright brass line with a darker brass edge on the storm side.
export const UNEXPLORED_BRASS = "#d8b25a";
export const UNEXPLORED_BRASS_DARK = "#6e4e1e";

// Remembered ("fogged") tiles -- explored but not currently in sight -- sit
// under a cool, drifting mist: plainly weather over land we can no longer
// see, rather than a recoloured biome or a rendering glitch. Land gets a
// normal-blend wash of FOGGED_WASH (pulling every colour toward one slate
// grey desaturates it and dims it a little, so brightness still steps down
// live -> remembered -> storm; a multiply could only darken it into a hole),
// trees and peaks are multiplied by FOGGED_FEATURE_TINT (3D), and water is
// pulled toward FOGGED_WATER. Over all of it drift wisps of FOGGED_MIST
// (client-map-3d-fogged-mist.ts / client-fogged-mist-2d.ts), which is what
// makes the tiles read as fog. Both renderers use the same wash and mist.
export const FOGGED_WASH = "#4a5460";
export const FOGGED_WASH_OPACITY = 0.55;
export const FOGGED_FEATURE_TINT = "#9aa4af";
export const FOGGED_WATER = "#4f5b66";
// How far remembered water is pulled toward FOGGED_WATER.
export const FOGGED_WATER_BLEND = 0.5;
// Mist wisps: thin haze everywhere on remembered tiles, thicker in drifting banks.
export const FOGGED_MIST_HAZE = "#7f8b98";
export const FOGGED_MIST_LIGHT = "#d2dae2";
export const FOGGED_MIST_MIN_OPACITY = 0.1;
export const FOGGED_MIST_MAX_OPACITY = 0.42;
