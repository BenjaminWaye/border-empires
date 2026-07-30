import {
  INTEGRITY_ECON_MIN_MULT,
  INTEGRITY_ECON_MAX_MULT,
  INTEGRITY_GROWTH_MIN_MULT,
  INTEGRITY_GROWTH_MAX_MULT
} from "./config.js";
import { exposureRatio } from "./math/math.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const DEFENSIBILITY_FULL_SCORE_RATIO = 0.8;

const lerpByIntegrity = (t: number, min: number, max: number): number => min + t * (max - min);

export const empireIntegrity = (Ts: number, Es: number): number => {
  const ratio = exposureRatio(Ts, Es);
  if (ratio >= DEFENSIBILITY_FULL_SCORE_RATIO) return 1;
  return clamp(ratio / (0.2 + 0.8 * ratio), 0, 1);
};

export const integrityEconomyMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_ECON_MIN_MULT, INTEGRITY_ECON_MAX_MULT);

export const integrityGrowthMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_GROWTH_MIN_MULT, INTEGRITY_GROWTH_MAX_MULT);
