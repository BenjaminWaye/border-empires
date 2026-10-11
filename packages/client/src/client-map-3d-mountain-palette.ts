// Facet colours for the true-3D mountains (lone peaks and ranges alike), in
// a warm low-poly style: brown rock on steep facets, grass on flat ledges,
// tops and the foot, and (ranges; lone peaks do it in the shader) white on
// the highest facets of snowy peaks. Every facet gets one flat colour.
import { Color } from "three";

const ROCK_A = new Color("#8f6c4f");
const ROCK_B = new Color("#6f5240");
const GRASS_A = new Color("#93bf48");
const GRASS_B = new Color("#76a63a");
const SNOW = new Color("#f2efe6");

/** Facets at least this flat (facet normal's upward component) hold grass. */
export const GRASS_FLATNESS = 0.93;
/** Facets this close to the ground (tile units) are the grassy foot. */
const FOOT_HEIGHT = 0.16;

export type MountainFacet = {
  /** Facet normal's upward component (1 = level). */
  readonly flat: number;
  /** Highest point of the facet above the ground. */
  readonly top: number;
  /** Facet centre height as a fraction of its peak's height (snow; rock lightens with it). */
  readonly heightFraction: number;
  /** 0 = no snow; otherwise snow above this height fraction. */
  readonly snowLine: number;
  /** 0..1, one per mountain: shifts its rock and grass shade a little. */
  readonly shade: number;
};

/** Writes the facet's colour into `out` and returns it. */
export const mountainFacetColor = (out: Color, facet: MountainFacet): Color => {
  if (facet.snowLine > 0 && facet.heightFraction >= facet.snowLine && facet.flat >= 0.3) return out.copy(SNOW);
  if (facet.flat >= GRASS_FLATNESS || facet.top <= FOOT_HEIGHT) return out.copy(GRASS_A).lerp(GRASS_B, facet.shade);
  // Rock lightens gently toward the summit (form without per-facet noise);
  // `shade` shifts the whole mountain a little.
  const height = Math.min(1, Math.max(0, facet.heightFraction));
  return out.copy(ROCK_B).lerp(ROCK_A, 0.25 + 0.65 * height - 0.2 * facet.shade);
};
