// "Which border is mine?" tuning for the reach border (the Aether Survey
// Line pylons/lines in 3D, the dashed reach line in 2D). Every empire's reach
// border used to render identically apart from colour, so a player couldn't
// pick out their own territory at a glance. The viewer's own border is
// emphasised (thicker, white-hot core, taller pylons, slow breathing pulse);
// rival borders are de-emphasised (thinner, dimmer, smaller pylons, static).
// Shared by both renderers so they agree on the same idea of "own".

export type ReachBorderEmphasis = "own" | "rival";

export type ReachEmphasisStyle = {
  /** Multiplier on the connecting line's radius. */
  readonly lineRadiusScale: number;
  /** Multiplier on line + pylon glow opacity. */
  readonly opacityMult: number;
  /** Multiplier on the whole pylon assembly's size. */
  readonly pylonScale: number;
};

const OWN_STYLE: ReachEmphasisStyle = { lineRadiusScale: 2.1, opacityMult: 1, pylonScale: 1.35 };
const RIVAL_STYLE: ReachEmphasisStyle = { lineRadiusScale: 0.65, opacityMult: 0.5, pylonScale: 0.8 };

export const reachEmphasisStyle = (emphasis: ReachBorderEmphasis): ReachEmphasisStyle =>
  emphasis === "own" ? OWN_STYLE : RIVAL_STYLE;

export const reachEmphasisFor = (ownerId: string, me: string | undefined): ReachBorderEmphasis =>
  me !== undefined && ownerId === me ? "own" : "rival";

/** White-hot centre drawn inside the viewer's own reach line (white, not gold -- gold is the fog edge's colour). */
export const OWN_REACH_CORE_COLOR = "#ffffff";
/** Core radius relative to the base (unscaled) line radius; the own line's sheath is OWN_STYLE.lineRadiusScale times that base. */
export const OWN_REACH_CORE_RADIUS_SCALE = 0.42;

const OWN_PULSE_PERIOD_MS = 2400;
const OWN_PULSE_MIN = 0.72;

/** Slow breathing pulse for the viewer's own border, in [OWN_PULSE_MIN, 1]. */
export const ownReachPulse = (nowMs: number): number =>
  OWN_PULSE_MIN + (1 - OWN_PULSE_MIN) * (0.5 + 0.5 * Math.sin((nowMs / OWN_PULSE_PERIOD_MS) * Math.PI * 2));
