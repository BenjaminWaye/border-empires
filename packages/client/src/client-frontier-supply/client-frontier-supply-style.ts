/**
 * Look-and-feel shared by the 2D and 3D supply-line renderers, so the two
 * stay in step (see AGENTS.md renderer parity).
 *
 * Supply reads as faint chevrons flowing outward from the reach edge, one
 * per tile hop, fading the further a tile sits beyond reach -- a long thin
 * line should look weaker than a short one. A hop out of a chokepoint (a
 * single tile everything past it depends on) flows amber instead, so a
 * fragile stretch reads as an amber stream, and a pulsing amber diamond
 * marks the pinch where that stretch begins.
 */

/** One chevron crosses one tile hop in this long. */
export const SUPPLY_FLOW_PERIOD_MS = 1_600;

/** Amber, matching the other "you're about to lose this" warnings on the map. */
export const SUPPLY_CHOKEPOINT_COLOR = "#ffb03b";

const NEAR_ALPHA = 0.9;
const FAR_ALPHA = 0.3;
const FADE_PER_HOP = 0.05;

/** Chevron opacity for a hop `depthBeyondReach` tiles past the reach edge. */
export const supplyChevronAlpha = (depthBeyondReach: number): number =>
  Math.max(FAR_ALPHA, NEAR_ALPHA - FADE_PER_HOP * Math.max(0, depthBeyondReach - 1));

/** 0..1 position of a chevron along its hop at `nowMs`; `phase` offsets extra chevrons on the same hop. */
export const supplyFlowFraction = (nowMs: number, phase = 0): number => {
  const t = nowMs / SUPPLY_FLOW_PERIOD_MS + phase;
  return t - Math.floor(t);
};

/** Fades a chevron in at the start of its hop and out at the end, so hops join into one stream. */
export const supplyChevronEdgeFade = (fraction: number): number => Math.min(1, fraction / 0.15, (1 - fraction) / 0.15);

/** 0..1 chokepoint pulse. */
export const supplyChokepointPulse = (nowMs: number): number => 0.5 + 0.5 * Math.sin((nowMs / 900) * Math.PI * 2);
