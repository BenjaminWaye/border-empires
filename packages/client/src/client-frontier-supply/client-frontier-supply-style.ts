/**
 * Look shared by the 2D and 3D supply-line renderers, so the two stay in
 * step (see AGENTS.md renderer parity).
 *
 * Supply lines only flag fragile land (see client-frontier-supply.ts). Each
 * runs from the nearest settled tile out to the frontier tip as a smoothed
 * ribbon that is kept pale and barely visible: what catches the eye are the
 * pulses travelling outward along it, like convoys. The cut tile the land
 * hangs on gets a ring that slowly brightens and fades in step with them.
 */

/** How far the empire colour is lifted toward white for the route core, so it reads on the empire's own territory. */
export const SUPPLY_CORE_WHITE_MIX = 0.55;

/** Route ribbon width, tiles. */
export const SUPPLY_ROUTE_WIDTH = 0.12;
/** Overall opacity of a route, pulses included: keeps even a passing pulse from shouting. */
export const SUPPLY_ROUTE_ALPHA = 0.7;

/**
 * Opacity of the steady ribbon between pulses, as a fraction of its lit
 * opacity. Kept very low so the route is barely there at rest and the player
 * reads it from the pulses travelling along it rather than from the line.
 */
export const SUPPLY_ROUTE_REST_ALPHA = 0.1;
/** Opacity of the dark shadow edge at rest; it lifts with a passing pulse so pulses stay legible on bright terrain. */
export const SUPPLY_SHADOW_REST_ALPHA = 0.05;
/** How much a passing pulse adds to the shadow edge's opacity. */
export const SUPPLY_SHADOW_PULSE_LIFT = 0.3;

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

/** Cut-tile ring: radius to the ring's centre line and its width, tiles. */
export const SUPPLY_CUT_RING_RADIUS = 0.32;
export const SUPPLY_CUT_RING_WIDTH = 0.06;
const CUT_RING_MIN_ALPHA = 0.3;
const CUT_RING_MAX_ALPHA = 0.65;

/** Cut-tile ring opacity: a slow breath, one per pulse, so the ring reads as part of the same supply line. */
export const supplyCutRingAlpha = (nowMs: number): number => {
  const periodMs = (SUPPLY_PULSE_SPACING / SUPPLY_PULSE_SPEED) * 1000;
  const breath = 0.5 - 0.5 * Math.cos(((nowMs % periodMs) / periodMs) * Math.PI * 2);
  return CUT_RING_MIN_ALPHA + (CUT_RING_MAX_ALPHA - CUT_RING_MIN_ALPHA) * breath;
};
