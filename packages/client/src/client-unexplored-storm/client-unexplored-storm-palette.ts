// Unexplored territory reads as a streaked storm-cloud bank, like weather
// drawn on an old map, instead of a black void; remembered tiles read as an
// old survey print (see FOGGED_PRINT_* below). The first ring of unexplored
// tiles shows its ground up to a brass survey edge, then the storm. Shared
// by both map renderers so the 2D canvas fallback and the true-3D view look
// like the same weather.
export const UNEXPLORED_STORM_DARK = "#3b4144";
export const UNEXPLORED_STORM_MID = "#545b5f";
export const UNEXPLORED_STORM_LIGHT = "#6f777b";
export const UNEXPLORED_STORM_INK = "#2a2f31";
// Brass survey edge where the fog ring's clear ground meets the storm: a bright brass line, a darker brass edge on the storm
// side, and rivet dots where it crosses tile edges.
export const UNEXPLORED_BRASS = "#d8b25a";
export const UNEXPLORED_BRASS_DARK = "#6e4e1e";
export const UNEXPLORED_RIVET = "#f6dc94";

// Remembered ("fogged") tiles -- explored but not currently in sight -- read
// as a pale, faded survey print rather than a dark hole -- light enough to
// sit between live colour and the storm, so brightness steps down outward
// instead of dipping and coming back up. Land gets a
// normal-blend wash of FOGGED_PRINT_SEPIA (pulling every colour toward one
// tan compresses saturation and contrast, like a faded print; a multiply
// could only darken), trees and peaks are multiplied by
// FOGGED_PRINT_FEATURE_TINT (3D), and water is pulled toward
// FOGGED_PRINT_WATER. The 2D renderer uses the same wash and water blend.
export const FOGGED_PRINT_SEPIA = "#c2ad87";
export const FOGGED_PRINT_WASH_OPACITY = 0.62;
export const FOGGED_PRINT_FEATURE_TINT = "#e6d2b4";
export const FOGGED_PRINT_WATER = "#8fa3a6";
// How far remembered water is pulled toward FOGGED_PRINT_WATER.
export const FOGGED_PRINT_WATER_BLEND = 0.6;
