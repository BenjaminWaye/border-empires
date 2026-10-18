/**
 * Look-and-feel shared by the 2D and 3D supply-route renderers, so the two
 * stay in step (see AGENTS.md renderer parity).
 *
 * Supply reads as routes, not per-tile marks: one smoothed ribbon per
 * stretch of the supply tree, thicker where more land depends on it (a trunk
 * carries its branches) and thinning and fading as it runs further past
 * reach. The ribbon itself is kept pale and barely visible: what catches the
 * eye are the bright pulses travelling outward along it, like convoys, and
 * the arrowhead each branch ends in at the frontier tip, lit as they pass.
 */

/** How far the empire colour is lifted toward white for the route core, so it reads on the empire's own territory. */
export const SUPPLY_CORE_WHITE_MIX = 0.55;

/** Route ribbon width, in tiles, for a hop feeding `downstream` beyond-reach tiles. */
export const supplyRouteWidth = (downstream: number): number => Math.min(0.3, 0.09 + 0.05 * Math.sqrt(Math.max(0, downstream - 1)));

const NEAR_ALPHA = 0.95;
const FAR_ALPHA = 0.35;
const FADE_PER_HOP = 0.04;

/** Route opacity `depthBeyondReach` tiles past the reach edge: supply thins out the further it runs. */
export const supplyRouteAlpha = (depthBeyondReach: number): number =>
  Math.max(FAR_ALPHA, NEAR_ALPHA - FADE_PER_HOP * Math.max(0, depthBeyondReach - 1));

/**
 * Opacity of the steady ribbon between pulses, as a fraction of its lit
 * opacity. Kept low so the route is barely there at rest and the player
 * reads it from the pulses travelling along it rather than from the line.
 */
export const SUPPLY_ROUTE_REST_ALPHA = 0.14;
/** Opacity of the dark shadow edge at rest; it lifts with a passing pulse so pulses stay legible on bright terrain. */
export const SUPPLY_SHADOW_REST_ALPHA = 0.05;

/** Pulse travel speed along a route, tiles per second. */
export const SUPPLY_PULSE_SPEED = 1.2;
/** Distance between pulses along a route, in tiles. */
export const SUPPLY_PULSE_SPACING = 2.4;

/**
 * 0..1 brightness of the travelling pulse at `distance` tiles along a route:
 * a bright head with a soft tail trailing back toward supply.
 */
export const supplyPulseAt = (distance: number, nowMs: number): number => {
  const t = (distance - (nowMs / 1000) * SUPPLY_PULSE_SPEED) / SUPPLY_PULSE_SPACING;
  // Pulses move toward larger distance. `behind` is how far (as a fraction of
  // the spacing) this point trails the pulse head just ahead of it.
  const behind = 1 - (t - Math.floor(t));
  const front = Math.min(1, behind / 0.04); // sharp leading edge
  const tail = Math.max(0, 1 - behind / 0.45); // soft tail back toward supply
  return front * tail;
};
