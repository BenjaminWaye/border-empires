import { LEVEL_CURVE_C, RATING_A, RATING_B, UNDERDOG_K } from "./config.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const wrapX = (x: number, width: number): number => (x + width) % width;
export const wrapY = (y: number, height: number): number => (y + height) % height;

export const exposureRatio = (T: number, E: number): number => {
  const safeT = Math.max(1, T);
  const safeE = Math.max(0, E);
  return safeE / (4 * safeT);
};

export const defensivenessMultiplier = (T: number, E: number): number => {
  // Defense efficiency is the inverse of exposure.
  // 0.0 = fully exposed, 1.0 = fully enclosed.
  return 1 - exposureRatio(T, E);
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
