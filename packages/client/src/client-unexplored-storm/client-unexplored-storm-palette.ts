// Unexplored territory reads as a streaked storm-cloud bank, like weather
// drawn on an old map, instead of a black void; remembered tiles read as an
// old survey print (see FOGGED_PRINT_* below). The first ring of unexplored
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

// Remembered ("fogged") tiles -- explored but not currently in sight -- read
// as a dimmed, greyed survey print: clearly fogged, but still lighter than
// the storm, so brightness steps down outward (live -> remembered -> storm)
// instead of dipping and coming back up. Land gets a normal-blend wash of
// FOGGED_PRINT_WASH (a neutral warm grey, not a tan: a tan wash vanished on
// sand and desert, so remembered desert looked exactly like land in sight;
// a normal blend rather than a multiply so dark grass doesn't crush to
// black), trees and peaks are multiplied by FOGGED_PRINT_FEATURE_TINT (3D),
// and water is pulled toward FOGGED_PRINT_WATER. The 2D renderer uses the
// same wash and water blend.
export const FOGGED_PRINT_WASH = "#6b6255";
export const FOGGED_PRINT_WASH_OPACITY = 0.55;
export const FOGGED_PRINT_FEATURE_TINT = "#a39a8c";
export const FOGGED_PRINT_WATER = "#5f5a52";
// How far remembered water is pulled toward FOGGED_PRINT_WATER.
export const FOGGED_PRINT_WATER_BLEND = 0.6;
