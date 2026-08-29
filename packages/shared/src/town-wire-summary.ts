import type { PopulationTier, TownGrowthUpgradeTier, TownType } from "./types.js";

// Tile["town"] wire shape, split out of types.ts to keep that file from
// growing past its 500-line cap (packages/client/src/client-tile-town-type.ts
// carries the client-side mirror of this same contract).
export type TownWireSummary = {
  name?: string;
  type: TownType;
  baseGoldPerMinute: number;
  supportCurrent: number;
  supportMax: number;
  goldPerMinute: number;
  cap: number;
  isFed: boolean;
  population: number;
  maxPopulation: number;
  populationGrowthPerMinute?: number;
  populationTier: PopulationTier;
  connectedTownCount: number;
  connectedTownBonus: number;
  connectedTownNames?: string[];
  // Mercantile Charter's firstThreeTownsGoldOutputMult/
  // firstThreeTownsPopulationGrowthMult, when this town is one of the
  // owner's first three and a domain/tech grants either. Omitted (not 1)
  // when no such bonus applies.
  firstThreeTownGoldMult?: number;
  firstThreeTownPopGrowthMult?: number;
  // Weapons Factory network totals: this town's connected-network count of
  // active Titanium/Umbrite Weapons Factories, self-inclusive of the whole
  // network (mirrors ConnectedTownNetworkEntry in
  // apps/simulation/src/economy-network/economy-network.ts, the same
  // scope combat actually reads from).
  connectedTitaniumWeaponsFactoryCount?: number;
  connectedUmbriteWeaponsFactoryCount?: number;
  manpowerCurrent?: number;
  manpowerCap?: number;
  hasMintworks: boolean;
  mintworksActive: boolean;
  // mintworks-stacking task: real count of active Mintworks in this town's
  // support ring, feeding mintworksGoldProductionMultiplier() — hasMintworks/
  // mintworksActive stay as-is for existing boolean consumers. Optional (not
  // required) so the large number of existing test-fixture town objects
  // across the monorepo don't all need updating under
  // exactOptionalPropertyTypes; every real read site treats a missing
  // value as 0 via `?? 0`.
  mintworksCount?: number;
  hasGranary: boolean;
  granaryActive: boolean;
  hasSeedGranary?: boolean;
  seedGranaryActive?: boolean;
  seedGranaryBuffed?: boolean;
  foodUpkeepPerMinute?: number;
  captureShockUntil?: number;
  populationBeforeCapture?: number;
  nearbyWarPausedUntil?: number;
  nearbyWarLastAt?: number;
  growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
  nextPopulationTierUpgrade?: {
    targetTier: TownGrowthUpgradeTier;
    requiredPopulation: number;
    goldCost: number;
    available: boolean;
  };
  // Census Hall (tech-tree redesign): the population/cap bonus currently
  // granted by this town's own Census Hall (+20,000 per connected city
  // with an active Incubation Engine/Granary) -- tracked so a later drop
  // in connected Granaries can claw the bonus back down rather than only
  // ever growing it.
  censusHallAppliedBonus?: number;
  // Unified building modifier display (stage 3): one group per building
  // type this town's support ring has active copies of, each with a
  // "<count> <Building>" heading (e.g. "3 Garrison Halls") and every
  // numeric stat that building contributes, summed across its own active
  // copies. Building types are never merged into a shared, unlabeled stat
  // bucket (Weapons Workshop and Titanium Weapons Factory both feed
  // "Empire attack", but get separate headings/totals) — every number
  // in the panel traces back to a specific building. Covers both flat
  // per-copy numbers and percent-per-copy ones (rendered as a percentage —
  // see StructureModifier's `unit` field in game-domain). Buildings whose
  // effect scales off something other than their own count in this town
  // (Census Hall off connected Incubation Engines, Customs House off
  // connected docks, Rail Depot/Assembly Works off other network
  // buildings, one-time bursts) are deliberately excluded — see
  // structureModifiersFor's rawValue contract in game-domain.
  townModifierTotals?: Array<{
    heading: string;
    modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>;
  }>;
};
