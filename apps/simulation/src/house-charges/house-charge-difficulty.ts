// One difficulty scale for every House Charge kind (docs/house-charges-plan.md,
// "Difficulty"). A charge's score estimates the garrison work in tiles, plus
// the corridor to reach it from the landing site, plus a sea crossing, scaled
// up when rival Houses land near the target or share it. Dealing turns the
// score into pips (1..4), and the pips set rarity and the Domain score a held
// charge banks, so harder charges pay more whatever their kind.
import { houseChargeRarityForPips, type HouseChargeKind, type HouseChargeRarity, type HouseChargePoint } from "@border-empires/shared";
import { chargeDistance, type HouseChargesWorld } from "./house-charges-world.js";

/** Tile-equivalent work for kinds whose effort is not a tile count. */
export const HOUSE_CHARGE_FIXED_EFFORT: Readonly<Partial<Record<HouseChargeKind, number>>> = {
  /** The relic and its eight footprint tiles: one garrison. */
  RELIC: 9,
  /** Taking and garrisoning a fortified AFC from a rival House. */
  CORRECTION: 60,
  /** Holding three towns on one landmass and growing each to Metropolis. */
  METROPOLIS: 120,
  /** Seat (no longer dealt): one town to City. */
  SEAT: 30
};
/** Charter: both towns must reach Town tier, on top of the road itself. */
export const HOUSE_CHARGE_CHARTER_TOWN_EFFORT = 20;
/** Share of a desert/tundra region that must be garrisoned (HOUSE_CHARGE_REGION_GARRISON_SHARE). */
const REGION_SHARE = 0.75;
/** A target off the landing site's landmass needs a dock or bridge first. */
export const HOUSE_CHARGE_CROSS_WATER_EFFORT = 15;
/** Rival landing sites within this distance of the target make it harder to hold. */
export const HOUSE_CHARGE_RIVAL_NEAR_DISTANCE = 20;
const RIVAL_NEAR_FACTOR = 0.1;
/** Each other House already dealt the same target. */
const SHARED_TARGET_FACTOR = 0.05;
const MAX_CONTEST_MULTIPLIER = 1.4;
/** Score bands: at or below each value, 1, 2 and 3 pips; above the last, 4. */
export const HOUSE_CHARGE_PIP_BANDS = [50, 110, 220] as const;

export type HouseChargeDifficultyInput = {
  readonly kind: HouseChargeKind;
  /** SURVEY/DESERT/TUNDRA: LAND tiles in the target. */
  readonly areaTiles?: number;
  /** CHARTER: distance between the two towns (the road). */
  readonly roadTiles?: number;
  /** Distance from the landing site to the nearest part of the target. */
  readonly reach: number;
  readonly crossesWater: boolean;
  /** Rival landing sites within HOUSE_CHARGE_RIVAL_NEAR_DISTANCE of the target. */
  readonly rivalsNear: number;
  /** Other Houses already dealt this target. */
  readonly otherHolders: number;
};

export type HouseChargeDifficulty = { readonly score: number; readonly renown: number; readonly rarity: HouseChargeRarity };

/** Tiles the House must garrison at the target itself. */
const effortTiles = (input: HouseChargeDifficultyInput): number => {
  switch (input.kind) {
    case "SURVEY":
      return input.areaTiles ?? 0;
    case "DESERT":
    case "TUNDRA":
      return Math.ceil((input.areaTiles ?? 0) * REGION_SHARE);
    case "CHARTER":
      return (input.roadTiles ?? 0) + HOUSE_CHARGE_CHARTER_TOWN_EFFORT;
    default:
      return HOUSE_CHARGE_FIXED_EFFORT[input.kind] ?? 0;
  }
};

export const houseChargePipsForScore = (score: number): number => {
  const band = HOUSE_CHARGE_PIP_BANDS.findIndex((limit) => score <= limit);
  return band === -1 ? HOUSE_CHARGE_PIP_BANDS.length + 1 : band + 1;
};

export const houseChargeDifficulty = (input: HouseChargeDifficultyInput): HouseChargeDifficulty => {
  const work = effortTiles(input) + Math.max(0, input.reach) + (input.crossesWater ? HOUSE_CHARGE_CROSS_WATER_EFFORT : 0);
  const contest = Math.min(MAX_CONTEST_MULTIPLIER, 1 + RIVAL_NEAR_FACTOR * input.rivalsNear + SHARED_TARGET_FACTOR * input.otherHolders);
  const score = Math.round(work * contest);
  const renown = houseChargePipsForScore(score);
  return { score, renown, rarity: houseChargeRarityForPips(renown) };
};

/** Rival landing sites near a target point (the House's own landing is never in the list). */
export const rivalsNearTarget = (
  world: Pick<HouseChargesWorld, "width" | "height">,
  rivalSites: readonly HouseChargePoint[],
  target: HouseChargePoint,
  exclude?: HouseChargePoint
): number =>
  rivalSites.filter((site) => !(exclude && site.x === exclude.x && site.y === exclude.y) && chargeDistance(world, site, target) <= HOUSE_CHARGE_RIVAL_NEAR_DISTANCE).length;
