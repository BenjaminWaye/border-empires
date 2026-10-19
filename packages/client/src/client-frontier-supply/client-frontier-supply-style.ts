/**
 * Look shared by the 2D and 3D supply-line renderers, so the two stay in
 * step (see AGENTS.md renderer parity).
 *
 * Supply lines only flag fragile land (see client-frontier-supply.ts), and
 * only as a pointer: a thin, static, dashed line in a pale empire tint, with
 * no glow, shadow or animation, plus a small ring on the cut tile the land
 * hangs on. It should be findable when you look for it, not pull the eye.
 */

/** How far the empire colour is lifted toward white, so the line reads on the empire's own territory. */
export const SUPPLY_LINE_WHITE_MIX = 0.35;
/** Line width, tiles. */
export const SUPPLY_LINE_WIDTH = 0.05;
/** Line opacity. */
export const SUPPLY_LINE_ALPHA = 0.45;
/** Dash length and the gap after it, tiles. */
export const SUPPLY_DASH_LENGTH = 0.22;
export const SUPPLY_DASH_GAP = 0.18;

/** Cut-tile ring: radius to the ring's centre line and its width, tiles. */
export const SUPPLY_CUT_RING_RADIUS = 0.3;
export const SUPPLY_CUT_RING_WIDTH = 0.05;
/** Cut-tile ring opacity. */
export const SUPPLY_CUT_RING_ALPHA = 0.6;

