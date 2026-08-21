// Need-weighted catalog for chooseBestEconomicBuild's non-resource,
// non-original-town-support economic structures (structure-command-planner.ts).
// The original 5 types (FARMSTEAD/UMBRITE_RIG/MINE/MINTWORKS/GRANARY) keep
// their existing hand-tuned foodLow/econWeak scoring — already shipped and
// tested, no reason to disturb it. This catalog is additive: it's how the
// newly-reachable types below get scored, using computeNeedVector's real
// deficit signal instead of another hand-picked flat number.
//
// Scope (docs/ai-structure-building-rewrite-plan.md's Phase 2 catalog work):
// only types with (a) a clean, single NeedKey to score against, confirmed
// against their real effect in structure-modifier-catalog-economic.ts (the
// same source of truth the client's own tooltips read from), and (b) a
// placement rule the planner already knows how to evaluate (an open settled
// tile, or an open town-support neighbor tile — see
// packages/shared/src/structure-placement-metadata.json). Left out
// deliberately: RAIL_DEPOT/ASSEMBLY_WORKS (their effect only matters if
// another specific structure — LOGISTICS_GUILD/GARRISON_HALL — is already
// present in the same network, "+X per Y in network", which the planner
// doesn't evaluate yet); CUSTOMS_HOUSE (placed directly on a dock tile, a
// placement rule the planner has no candidate-gathering for yet);
// SEED_GRANARY/CENSUS_HALL/CLEARING_HOUSE (population/upgrade-cost/synergy
// effects with no clean NeedVector counterpart, and some need a prerequisite
// structure already built); the wonder chain (needs completed PART
// prerequisites first, out of scope per the plan's §15 open questions).
//
// The 3 synthesizer entries were originally single-copy-only, citing
// structure-slots.ts's "hard-capped at exactly 1 slot ... forever" comment —
// that comment is stale. runtime-structure-command-handlers.ts's
// upgradeBaseType section documents the cap as removed ("Decision 5:
// unlimited SYNTHESIZE-mode converters per family"), and
// resourceSlotSupplyForPlayer (resource-slot-view.ts) sums
// structureSlotRequirements per ACTIVE synthesizer tile with no dedup — each
// additional copy genuinely adds its own +1 slot supply. A 2nd copy is only
// rejected when it lands on the SAME town's support ring as an existing one
// of the same type (economicStructureForSupportedTown, already enforced
// generically for every catalog entry via existingSupportStructureTypes in
// chooseBestEconomicBuild) — there is no empire-wide cap.
import type { EconomicStructureType } from "@border-empires/shared";
import type { NeedKey, NeedVector } from "./build-need-vector.js";

export type EconomicCatalogPlacement = "open_settled" | "town_support";

export type EconomicCatalogEntry = {
  type: EconomicStructureType;
  needKey: NeedKey;
  placement: EconomicCatalogPlacement;
  /**
   * Score when needKey's deficit is fully acute (needVector value = 1),
   * scaling linearly down to 0 as the deficit closes. Calibrated to sit
   * inside chooseBestEconomicBuild's existing fixed-score range (roughly
   * 20-190) so catalog and hand-tuned candidates compare sensibly against
   * each other on the same tile.
   */
  maxScore: number;
};

export const ECONOMIC_STRUCTURE_CATALOG: readonly EconomicCatalogEntry[] = [
  // Same-tile, any open settled land (no resource/town requirement) —
  // structure-placement-metadata.json's "settled" surface.
  { type: "WATERWORKS", needKey: "FOOD_SLOTS", placement: "open_settled", maxScore: 150 },
  { type: "GOVERNORS_OFFICE", needKey: "FOOD_SLOTS", placement: "open_settled", maxScore: 130 },

  // Town-support neighbor tile — same placement mechanism already used for
  // MINTWORKS/GRANARY (openTownSupportNeighborTiles).
  { type: "GARRISON_HALL", needKey: "MANPOWER_CEILING", placement: "town_support", maxScore: 150 },
  { type: "LOGISTICS_GUILD", needKey: "MANPOWER_THROUGHPUT", placement: "town_support", maxScore: 160 },
  { type: "CARAVANARY", needKey: "GOLD", placement: "town_support", maxScore: 120 },
  { type: "UMBRITE_SYNTHESIZER", needKey: "UMBRITE_SLOTS", placement: "town_support", maxScore: 150 },
  { type: "TITANIUM_WORKS", needKey: "TITANIUM_SLOTS", placement: "town_support", maxScore: 150 },
  { type: "CRYSTAL_SYNTHESIZER", needKey: "CRYSTAL_SLOTS", placement: "town_support", maxScore: 150 }
] as const;

export const economicCatalogScore = (entry: EconomicCatalogEntry, needVector: NeedVector): number =>
  entry.maxScore * needVector[entry.needKey];
