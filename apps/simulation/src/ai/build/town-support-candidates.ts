// Candidate types (and scores) for an open support tile next to one town —
// extracted from chooseBestEconomicBuild (structure-command-planner.ts) when
// docs/ai-economic-synergy-plan.md added synergy scoring, to keep that file
// under the 500-line limit.
import type { EconomicStructureType } from "@border-empires/shared";
import type { NeedVector } from "./build-need-vector.js";
import { ECONOMIC_STRUCTURE_CATALOG, economicCatalogScore } from "./economic-structure-catalog.js";
import { SYNERGY_SCORED_TYPES, synergyCandidatesForTown, type SynergyContext } from "./economic-synergy-scoring.js";
import type { TownEconomyEntry } from "./town-economy-view.js";

export type TownSupportCandidate = { type: EconomicStructureType; score: number };

export const townSupportCandidates = (args: {
  foodLow: boolean;
  needVector: NeedVector | undefined;
  /** This town's entry in the planner's town-economy view, when exported. */
  town: TownEconomyEntry | undefined;
  synergy: SynergyContext;
}): TownSupportCandidate[] => {
  const { foodLow, needVector, town } = args;
  // Hand-tuned food response, unchanged: a starving town produces no coin, so
  // Incubation Engine leads and Manufactory (which needs a FOOD slot) waits.
  const candidates: TownSupportCandidate[] = [{ type: "INCUBATION_ENGINE", score: foodLow ? 160 : 20 }];
  if (town) {
    for (const candidate of synergyCandidatesForTown(town, args.synergy)) {
      if (foodLow && candidate.type === "MANUFACTORY") continue;
      candidates.push({ type: candidate.type, score: candidate.score });
    }
  } else if (!foodLow) {
    // No town-economy view (older main-thread build, test fixtures): the
    // pre-synergy flat score.
    candidates.push({ type: "MANUFACTORY", score: 54 });
  }
  if (needVector) {
    for (const entry of ECONOMIC_STRUCTURE_CATALOG) {
      if (entry.placement !== "town_support") continue;
      // Synergy scoring owns these types whenever it has the town's data.
      if (town && SYNERGY_SCORED_TYPES.has(entry.type)) continue;
      // A deficit of exactly 0 means the need is already fully met —
      // proposing the build anyway would spend manpower for zero value.
      // chooseBestEconomicBuild's best-pick loop has no score>0 filter of its
      // own, so the catalog must not push a 0-score candidate.
      const score = economicCatalogScore(entry, needVector);
      if (score > 0) candidates.push({ type: entry.type, score });
    }
  }
  return candidates;
};
