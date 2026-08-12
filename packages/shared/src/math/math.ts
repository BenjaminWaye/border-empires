import { DEF_MULT_MAX, DEF_MULT_MIN, LEVEL_CURVE_C, RATING_A, RATING_B, UNDERDOG_K, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const DEFENSIBILITY_FULL_SCORE_RATIO = 0.8;
const wrap = (value: number, size: number): number => {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
};

export const wrapX = (x: number, width: number): number => wrap(x, width);
export const wrapY = (y: number, height: number): number => wrap(y, height);
export const SETTLED_DEFENSE_NEAR_FORT_RADIUS = 1;

export const wrappedChebyshevDistance = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): number => {
  const dx = Math.min(Math.abs(ax - bx), width - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), height - Math.abs(ay - by));
  return Math.max(dx, dy);
};

export const exposureWeightFromSides = (exposedSides: number): number => {
  const boundedSides = Math.max(0, Math.min(4, Math.round(exposedSides)));
  if (boundedSides <= 1) return 0;
  if (boundedSides === 2) return 1;
  if (boundedSides === 3) return 2.5;
  return 4;
};

export const idealExposureForTiles = (T: number): number => 2 * Math.ceil(2 * Math.sqrt(Math.max(1, T)));

export const fullDefensibilityExposureForTiles = (T: number): number => idealExposureForTiles(T) / DEFENSIBILITY_FULL_SCORE_RATIO;

export const exposureRatio = (T: number, E: number): number => {
  const safeE = Math.max(0, E);
  if (safeE <= 0) return 1;
  return clamp(idealExposureForTiles(T) / safeE, 0, 1);
};

export const defensibilityScore = (T: number, E: number): number => {
  const ratio = exposureRatio(T, E);
  if (ratio >= DEFENSIBILITY_FULL_SCORE_RATIO) return 1;
  // Raw perimeter ratio underrates ordinary frontiers. This curve keeps
  // perfect shapes at 100% while lifting the practical mid-range much harder.
  return clamp(ratio / (0.2 + 0.8 * ratio), 0, 1);
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

// Combat odds use an exponentiated power ratio (Bradley-Terry style) rather
// than a flat linear ratio, so a decisive power gap compounds toward
// certainty instead of asymptoting slowly. With p=1 (the old behavior) a 2:1
// power edge only ever bought 66.7% odds and a 9:1 edge was needed for 90%.
// At p=2, 2:1 -> 80%, 4:1 -> 94%, matching the "overwhelming force should
// feel overwhelming" intuition without a full attrition/HP rewrite.
export const COMBAT_WIN_CHANCE_EXPONENT = 2;

export const combatWinChance = (atkEff: number, defEff: number): number => {
  if (atkEff <= 0) return 0;
  if (defEff <= 0) return 1;
  const atkPow = atkEff ** COMBAT_WIN_CHANCE_EXPONENT;
  const defPow = defEff ** COMBAT_WIN_CHANCE_EXPONENT;
  return atkPow / (atkPow + defPow);
};

export const randomFactor = (): number => 0.95 + Math.random() * 0.1;
