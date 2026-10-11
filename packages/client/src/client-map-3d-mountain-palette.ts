// Facet colours for the true-3D mountains (lone peaks and ranges alike), by
// climate: temperate mountains are warm brown rock with a grassy foot;
// alpine ones -- in cold country -- are grey rock under snow with a stony foot. Ranges get their snow here; lone peaks in the shader.
// Every facet gets one flat colour.
import { Color } from "three";

const ROCK_A = new Color("#8f6c4f");
const ROCK_B = new Color("#6f5240");
const ALPINE_A = new Color("#9a9ca4");
const ALPINE_B = new Color("#62656d");
const GRASS_A = new Color("#93bf48");
const GRASS_B = new Color("#76a63a");
const SNOW = new Color("#f2efe6");
// An alpine mountain's foot: pale stony ground, not grass.
const ALPINE_FOOT = new Color("#a2a4a8");

/** Facets this close to the ground (tile units) are the grassy foot. */
const FOOT_HEIGHT = 0.16;

export type MountainFacet = {
  /** Facet normal's upward component (1 = level); snow only settles on facets flat enough. */
  readonly flat: number;
  /** Highest point of the facet above the ground. */
  readonly top: number;
  /** Facet centre height as a fraction of its peak's height (snow; rock lightens with it). */
  readonly heightFraction: number;
  /** 0 = no snow; otherwise snow above this height fraction. */
  readonly snowLine: number;
  /** 0..1, one per mountain: shifts its rock and grass shade a little. */
  readonly shade: number;
  /** Cold-country mountain: grey rock, stony foot. */
  readonly alpine: boolean;
};

/** Writes the facet's colour into `out` and returns it. */
export const mountainFacetColor = (out: Color, facet: MountainFacet): Color => {
  if (facet.snowLine > 0 && facet.heightFraction >= facet.snowLine && facet.flat >= 0.3) return out.copy(SNOW);
  // Grass only at the foot: green patches higher up (flat facets where slopes
  // meet, or a mesa's top between taller peaks) read as holes in the rock.
  if (facet.top <= FOOT_HEIGHT) return facet.alpine ? out.copy(ALPINE_FOOT) : out.copy(GRASS_A).lerp(GRASS_B, facet.shade);
  // Rock lightens gently toward the summit (form without per-facet noise);
  // `shade` shifts the whole mountain a little.
  const height = Math.min(1, Math.max(0, facet.heightFraction));
  return out.copy(facet.alpine ? ALPINE_B : ROCK_B).lerp(facet.alpine ? ALPINE_A : ROCK_A, 0.25 + 0.65 * height - 0.2 * facet.shade);
};
