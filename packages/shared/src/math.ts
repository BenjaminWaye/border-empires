import { DEF_MULT_MAX, DEF_MULT_MIN, LEVEL_CURVE_C, RATING_A, RATING_B, UNDERDOG_K } from "./config.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const wrapX = (x: number, width: number): number => (x + width) % width;
export const wrapY = (y: number, height: number): number => (y + height) % height;

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
  return safeE / (4 * safeT);
};

export const defensivenessMultiplier = (T: number, E: number): number => {
  // Low exposure should reward compact empires with a strong defensive ceiling,
  // while heavily exposed borders fall back to the configured floor.
  const compactness = 1 - exposureRatio(T, E);
  return clamp(1 + compactness * 1.05, DEF_MULT_MIN, DEF_MULT_MAX);
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
