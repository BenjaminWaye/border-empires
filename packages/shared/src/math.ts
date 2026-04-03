import { DEF_MULT_MAX, DEF_MULT_MIN, LEVEL_CURVE_C, RATING_A, RATING_B, UNDERDOG_K } from "./config.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const wrap = (value: number, size: number): number => {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
};

export const wrapX = (x: number, width: number): number => wrap(x, width);
export const wrapY = (y: number, height: number): number => wrap(y, height);

export const exposureWeightFromSides = (exposedSides: number): number => {
  const boundedSides = Math.max(0, Math.min(4, Math.round(exposedSides)));
  if (boundedSides <= 1) return 0;
  if (boundedSides === 2) return 1;
  if (boundedSides === 3) return 2.5;
  return 4;
};

export const exposureRatio = (T: number, E: number): number => {
  const safeT = Math.max(1, T);
  const safeE = Math.max(0, E);
  if (safeE <= 0) return 1;
  const idealPerimeter = 2 * Math.ceil(2 * Math.sqrt(safeT));
  return clamp(idealPerimeter / safeE, 0, 1);
};

export const defensibilityScore = (T: number, E: number): number => {
  const ratio = exposureRatio(T, E);
  // Raw perimeter ratio underrates ordinary frontiers. This curve keeps
  // perfect shapes at 100% while lifting the practical mid-range.
  return clamp(ratio / (0.4 + 0.6 * ratio), 0, 1);
};

export const defensivenessMultiplier = (T: number, E: number): number => {
  // Defensibility compares the current exposed settled perimeter against the
  // minimum possible perimeter for the same number of tiles. Compact shapes and
  // terrain-backed borders stay high; stretched or fractured shapes fall off.
  return clamp(defensibilityScore(T, E), DEF_MULT_MIN, DEF_MULT_MAX);
};

export const ratingFromPointsLevel = (points: number, level: number): number => {
  return RATING_A * Math.log(points + 1) + RATING_B * Math.log(level + 1);
};

export const underdogMultiplier = (attackerRating: number, defenderRating: number): number => {
  const diff = defenderRating - attackerRating;
  return clamp(Math.exp(diff / UNDERDOG_K), 0.01, 8.0);
};

export const pvpPointsReward = (baseTileValue: number, attackerRating: number, defenderRating: number): number => {
  return baseTileValue * underdogMultiplier(attackerRating, defenderRating);
};

export const levelFromPoints = (points: number): number => {
  return Math.floor(LEVEL_CURVE_C * Math.log(points + 1));
};

export const combatWinChance = (atkEff: number, defEff: number): number => {
  if (atkEff <= 0) return 0;
  if (defEff <= 0) return 1;
  return atkEff / (atkEff + defEff);
};

export const randomFactor = (): number => 0.95 + Math.random() * 0.1;
