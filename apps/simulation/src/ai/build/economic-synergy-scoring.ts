// Marginal-value scoring for the stacking economy buildings and the buildings
// that amplify them — Phases 3 and 4 of docs/ai-economic-synergy-plan.md.
//
// Coin engine: Manufactory (stacks per town; +10% town coin each, +35% with a
// Clearing House in reach), Clearing House (lifts every Manufactory in reach),
// Trade Nexus (switches on the connected-town bonus: +50/+40/+30% for the
// 1st–3rd connected town). These multiply, so the right order is what makes a
// coin economy.
//
// Manpower engine: Ancillary Depot (stacks per town; +150 cap + 10% of the
// town's base cap each, 35% with a Reserve Lattice in reach), Reserve Lattice,
// Ancillary Factory (one per town; +0.05 manpower/min, +0.10 more inside a
// Neural Works network) and Neural Works.
//
// Each candidate scores by what building it *now* would add, given what the
// town and the towns it is connected to already have. Scores stay inside
// chooseBestEconomicBuild's existing range (roughly 20–190) so they compete
// fairly with Hydrogarden, Incubation Engine, forts and the catalog types.
//
// Neighbour estimates: a town's ConnectedTownNetworkEntry gives counts and
// amplifier presence for its connected towns but not their Manufactory
// counts, so a Clearing House's value to neighbours uses the empire's average
// Manufactories per town. Good enough to rank candidates; not an income model.
import {
  MANUFACTORY_GOLD_PRODUCTION_BONUS,
  MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE
} from "@border-empires/game-domain";
import { ANCILLARY_DEPOT_MANPOWER_CAP_BONUS, type EconomicStructureType } from "@border-empires/shared";
import type { NeedVector } from "./build-need-vector.js";
import type { TownEconomyEntry } from "./town-economy-view.js";

/** Types this module scores whenever a town-economy entry is available. */
export const SYNERGY_SCORED_TYPES: ReadonlySet<EconomicStructureType> = new Set<EconomicStructureType>([
  "MANUFACTORY",
  "CLEARING_HOUSE",
  "TRADE_NEXUS",
  "ANCILLARY_DEPOT",
  "RESERVE_LATTICE",
  "ANCILLARY_FACTORY",
  "NEURAL_WORKS"
]);

export type SynergyCandidate = { type: EconomicStructureType; score: number; gain: number };

export type SynergyContext = {
  needVector: NeedVector | undefined;
  /** Empire-wide mean Manufactories per town (see averageManufactoriesPerTown). */
  averageManufactoriesPerTown: number;
  /** Amplifier types already under construction somewhere (see pendingAmplifierTypes). */
  pendingAmplifiers?: ReadonlySet<EconomicStructureType>;
};

/**
 * Amplifier types under construction anywhere in the view. A connected town's
 * network entry only lists *active* Clearing Houses / Trade Nexuses, so
 * without this a town next to one that is still going up would propose a
 * redundant second one. Builds take 60 s, so holding the type back
 * empire-wide until it finishes costs at most that long elsewhere.
 */
export const pendingAmplifierTypes = (view: readonly TownEconomyEntry[]): ReadonlySet<EconomicStructureType> =>
  new Set(view.flatMap((town) => town.amplifiersUnderConstruction));

// Coin: the floor matches the old flat Manufactory score (54) so a first
// Manufactory competes exactly as before; the ceiling (150) stays under the
// food-crisis Incubation Engine (160) and Hydrogarden (190) so a starving
// town (which earns no coin at all) still feeds itself first.
const COIN_SCORE_FLOOR = 54;
const COIN_SCORE_RANGE = 96;
// A gain of 1.0 = one extra base-town's worth of coin; anything above that is
// already the best coin move available.
const COIN_GAIN_REFERENCE = 1;
const DEPOT_SCORE_MAX = 150;
const DEPOT_GAIN_REFERENCE = 300;
const FACTORY_SCORE_MAX = 160;
const FACTORY_STANDALONE_REGEN = 0.05;
const NEURAL_WORKS_REGEN_PER_FACTORY = 0.1;
const NEURAL_WORKS_GAIN_REFERENCE = 0.3;
const RESERVE_LATTICE_DEPOT_LIFT = 0.25;
const DEPOT_BASE_CAP_SHARE = 0.1;
const DEPOT_BASE_CAP_SHARE_WITH_LATTICE = 0.35;
/** Amplifiers need something to amplify: at least this many in reach. */
export const AMPLIFIER_MIN_TARGETS = 2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** connectedTownBonusForPlayer's base ladder, without tech step bonuses. */
export const connectedTownBonusFor = (connectedTownCount: number): number =>
  [0.5, 0.4, 0.3].slice(0, Math.max(0, Math.min(3, connectedTownCount))).reduce((sum, step) => sum + step, 0);

export const averageManufactoriesPerTown = (view: readonly TownEconomyEntry[]): number =>
  view.length === 0 ? 0 : view.reduce((sum, entry) => sum + entry.manufactories, 0) / view.length;

const manufactoryPerCopy = (clearingHouseInReach: boolean): number =>
  clearingHouseInReach ? MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE : MANUFACTORY_GOLD_PRODUCTION_BONUS;

const coinScore = (gain: number, needVector: NeedVector | undefined): number =>
  COIN_SCORE_FLOOR + COIN_SCORE_RANGE * clamp01(gain / COIN_GAIN_REFERENCE) * (0.5 + 0.5 * (needVector?.GOLD ?? 0));

const coinCandidates = (town: TownEconomyEntry, ctx: SynergyContext): SynergyCandidate[] => {
  const out: SynergyCandidate[] = [];
  const connectedMult = 1 + town.connectedTownBonus;
  const manufactoryMult = 1 + manufactoryPerCopy(town.clearingHouseInReach) * town.manufactories;

  const manufactoryGain = manufactoryPerCopy(town.clearingHouseInReach) * connectedMult * town.baseGoldWeight;
  out.push({ type: "MANUFACTORY", score: coinScore(manufactoryGain, ctx.needVector), gain: manufactoryGain });

  const manufactoriesInReach = town.manufactories + town.connectedTownCount * ctx.averageManufactoriesPerTown;
  if (!town.clearingHouseInReach && manufactoriesInReach >= AMPLIFIER_MIN_TARGETS) {
    const lift = MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE - MANUFACTORY_GOLD_PRODUCTION_BONUS;
    const gain = lift * manufactoriesInReach * connectedMult * town.baseGoldWeight;
    out.push({ type: "CLEARING_HOUSE", score: coinScore(gain, ctx.needVector), gain });
  }

  // A Trade Nexus in an isolated town, or in a neighbourhood that already has
  // one, adds nothing — the old need-only catalog score built it anyway.
  if (!town.tradeNexusInReach && town.connectedTownCount >= 1) {
    const gain = connectedTownBonusFor(town.connectedTownCount) * manufactoryMult * town.baseGoldWeight * (1 + town.connectedTownCount);
    out.push({ type: "TRADE_NEXUS", score: coinScore(gain, ctx.needVector), gain });
  }
  return out;
};

const manpowerCandidates = (town: TownEconomyEntry, needVector: NeedVector): SynergyCandidate[] => {
  const out: SynergyCandidate[] = [];
  const ceiling = needVector.MANPOWER_CEILING;
  const throughput = needVector.MANPOWER_THROUGHPUT;

  if (ceiling > 0) {
    const share = town.reserveLatticeInReach ? DEPOT_BASE_CAP_SHARE_WITH_LATTICE : DEPOT_BASE_CAP_SHARE;
    const depotGain = ANCILLARY_DEPOT_MANPOWER_CAP_BONUS + town.baseManpowerCap * share;
    out.push({ type: "ANCILLARY_DEPOT", score: DEPOT_SCORE_MAX * ceiling * (0.5 + 0.5 * clamp01(depotGain / DEPOT_GAIN_REFERENCE)), gain: depotGain });

    const depotsInReach = town.ancillaryDepots + Math.max(0, town.depotTownsInReach - (town.ancillaryDepots > 0 ? 1 : 0));
    if (!town.reserveLatticeInReach && depotsInReach >= AMPLIFIER_MIN_TARGETS) {
      const gain = RESERVE_LATTICE_DEPOT_LIFT * town.baseManpowerCap * depotsInReach;
      out.push({ type: "RESERVE_LATTICE", score: DEPOT_SCORE_MAX * ceiling * clamp01(gain / DEPOT_GAIN_REFERENCE), gain });
    }
  }

  if (throughput > 0) {
    if (!town.hasAncillaryFactory) {
      const gain = FACTORY_STANDALONE_REGEN + (town.neuralWorksInReach ? NEURAL_WORKS_REGEN_PER_FACTORY : 0);
      const fullValue = FACTORY_STANDALONE_REGEN + NEURAL_WORKS_REGEN_PER_FACTORY;
      out.push({ type: "ANCILLARY_FACTORY", score: FACTORY_SCORE_MAX * throughput * (0.6 + 0.4 * (gain / fullValue)), gain });
    }
    if (!town.neuralWorksInReach && town.ancillaryFactoriesInReach >= AMPLIFIER_MIN_TARGETS) {
      const gain = NEURAL_WORKS_REGEN_PER_FACTORY * town.ancillaryFactoriesInReach;
      out.push({ type: "NEURAL_WORKS", score: FACTORY_SCORE_MAX * throughput * clamp01(gain / NEURAL_WORKS_GAIN_REFERENCE), gain });
    }
  }
  return out;
};

/**
 * Every synergy candidate worth proposing at `town`, with score > 0. Manpower
 * candidates need a need vector (as the old catalog entries did); coin ones
 * fall back to a neutral GOLD weight without one.
 */
export const synergyCandidatesForTown = (town: TownEconomyEntry, ctx: SynergyContext): SynergyCandidate[] => [
  ...coinCandidates(town, ctx),
  ...(ctx.needVector ? manpowerCandidates(town, ctx.needVector) : [])
].filter((candidate) => candidate.score > 0 && !ctx.pendingAmplifiers?.has(candidate.type));

/**
 * Phase 5: towns that would earn more from one more connected town — they
 * have a Trade Nexus in reach (the next connection adds the next bonus step)
 * or enough Manufactories that a Trade Nexus would pay once they connect —
 * and are still below the 3-town bonus cap. Feeds the EXPAND scorer's
 * town-link bonus (ai-settlement-priority.ts). O(towns).
 */
export const linkValueTownKeys = (view: readonly TownEconomyEntry[]): ReadonlySet<string> =>
  new Set(
    view
      .filter((town) => town.connectedTownCount < 3 && (town.tradeNexusInReach || town.manufactories >= AMPLIFIER_MIN_TARGETS))
      .map((town) => town.townKey)
  );
