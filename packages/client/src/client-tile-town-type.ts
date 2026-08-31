// Tile["town"] wire shape, split out of client-types.ts to keep that file
// from growing past its 500-line cap (packages/shared/src/types.ts carries
// the matching server-side contract — see its Tile["town"] field for the
// authoritative doc comments).
export type ClientTownWireSummary = {
  name?: string;
  type: "MARKET" | "FARMING";
  baseGoldPerMinute: number;
  supportCurrent: number;
  supportMax: number;
  goldPerMinute: number;
  cap: number;
  isFed: boolean;
  population: number;
  maxPopulation: number;
  populationGrowthPerMinute?: number;
  populationTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  connectedTownCount: number;
  connectedTownBonus: number;
  connectedTownNames?: string[];
  // Mercantile Charter's firstThreeTownsGoldOutputMult/
  // firstThreeTownsPopulationGrowthMult, when this town is one of the
  // owner's first three and a domain/tech grants either. Omitted (not 1)
  // when no such bonus applies.
  firstThreeTownGoldMult?: number;
  firstThreeTownPopGrowthMult?: number;
  connectedTitaniumWeaponsFactoryCount?: number;
  connectedUmbriteWeaponsFactoryCount?: number;
  manpowerCurrent?: number;
  manpowerCap?: number;
  hasMintworks: boolean;
  mintworksActive: boolean;
  mintworksCount?: number;
  hasGranary: boolean;
  granaryActive: boolean;
  hasSeedGranary?: boolean; seedGranaryActive?: boolean; seedGranaryBuffed?: boolean;
  hasClearingHouse?: boolean; clearingHouseActive?: boolean; clearingHouseTownNames?: string[];
  foodUpkeepPerMinute?: number;
  captureShockUntil?: number;
  populationBeforeCapture?: number;
  growthModifiers?: Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
  nextPopulationTierUpgrade?: {
    targetTier: "CITY" | "GREAT_CITY" | "METROPOLIS";
    requiredPopulation: number;
    goldCost: number;
    available: boolean;
  };
  // Unified building modifier display (stage 3): one group per building
  // type with active copies in this town's support ring, each carrying a
  // "<count> <Building>" heading and every stat that building contributes,
  // summed across its own copies only — never merged across building
  // types that happen to feed the same stat name (e.g. Weapons Workshop +
  // Titanium Weapons Factory both feed "Empire attack" but get separate
  // headings). See packages/shared/src/types.ts's matching field for the
  // full contract.
  townModifierTotals?: Array<{
    heading: string;
    modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>;
  }>;
};
