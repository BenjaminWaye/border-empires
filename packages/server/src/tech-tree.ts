import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export type StatsModKey = "attack" | "defense" | "income" | "vision";

export interface TechEffects {
  unlockFarmstead?: boolean;
  unlockCamp?: boolean;
  unlockMine?: boolean;
  unlockMarket?: boolean;
  unlockGranary?: boolean;
  unlockCensusHall?: boolean;
  unlockBank?: boolean;
  unlockClearingHouse?: boolean;
  unlockCaravanary?: boolean;
  unlockWoodenFort?: boolean;
  unlockLightOutpost?: boolean;
  unlockFurSynthesizer?: boolean;
  unlockIronworks?: boolean;
  unlockCrystalSynthesizer?: boolean;
  unlockSynthOverload?: boolean;
  unlockAdvancedSynthesizers?: boolean;
  unlockFuelPlant?: boolean;
  unlockFoundry?: boolean;
  unlockAetherTower?: boolean;
  unlockExchangeHouse?: boolean;
  unlockCustomsHouse?: boolean;
  unlockHarborLocksUpgrade?: boolean;
  unlockCharteredPortsUpgrade?: boolean;
  unlockRailDepot?: boolean;
  unlockGovernorsOffice?: boolean;
  unlockGarrisonHall?: boolean;
  unlockAirport?: boolean;
  unlockRadarSystem?: boolean;
  unlockImperialExchange?: boolean;
  unlockWorldEngine?: boolean;
  unlockAegisDome?: boolean;
  unlockAegisLock?: boolean;
  unlockAstralDock?: boolean;
  unlockAstralDockLaunch?: boolean;
  unlockStormfront?: boolean;
  unlockObservatory?: boolean;
  unlockForts?: boolean;
  unlockSiegeOutposts?: boolean;
  unlockRevealRegion?: boolean;
  unlockRevealEmpire?: boolean;
  unlockRevealEmpireStats?: boolean;
  unlockDeepStrike?: boolean;
  unlockNavalInfiltration?: boolean;
  unlockAetherWall?: boolean;
  unlockSabotage?: boolean;
  unlockSurveySweep?: boolean;
  unlockAetherLance?: boolean;
  unlockRetortRecasting?: boolean;
  unlockTerrainShaping?: boolean;
  unlockIronBastion?: boolean;
  unlockSiegeTower?: boolean;
  unlockThunderBastion?: boolean;
  unlockDreadTower?: boolean;
  unlockWaterworksUpgrade?: boolean;
  unlockAetherEmp?: boolean;
  unlockCityOverclock?: boolean;
  settlementSpeedMult?: number;
  operationalTempoMult?: number;
  researchTimeMult?: number;
  abilityCooldownMult?: number;
  populationGrowthMult?: number;
  firstThreeTownsPopulationGrowthMult?: number;
  firstThreeTownsGoldOutputMult?: number;
  populationCapFirst3TownsMult?: number;
  growthPauseDurationMult?: number;
  townFoodUpkeepMult?: number;
  settledFoodUpkeepMult?: number;
  settledGoldUpkeepMult?: number;
  townGoldOutputMult?: number;
  townGoldCapMult?: number;
  marketBonusMult?: number;
  granaryBonusMult?: number;
  marketIncomeBonusAdd?: number;
  marketCapBonusAdd?: number;
  granaryCapBonusAdd?: number;
  granaryCapBonusAddPctPoints?: number;
  populationIncomeMult?: number;
  connectedTownStepBonusAdd?: number;
  harvestCapMult?: number;
  fortDefenseMult?: number;
  fortIronUpkeepMult?: number;
  fortGoldUpkeepMult?: number;
  outpostAttackMult?: number;
  outpostSupplyUpkeepMult?: number;
  outpostGoldUpkeepMult?: number;
  revealUpkeepMult?: number;
  revealCapacityBonus?: number;
  visionRadiusBonus?: number;
  observatoryRangeBonus?: number;
  observatoryProtectionRadiusBonus?: number;
  observatoryCastRadiusBonus?: number;
  buildCapacityAdd?: number;
  developmentProcessCapacityAdd?: number;
  dockGoldOutputMult?: number;
  dockGoldCapMult?: number;
  dockConnectionBonusPerLink?: number;
  dockRoutesVisible?: boolean;
  supportEconomicFoodUpkeepMult?: number;
  frontierDefenseAdd?: number;
  settledDefenseMult?: number;
  attackVsSettledMult?: number;
  attackVsFortsMult?: number;
  newSettlementDefenseMult?: number;
  sabotageCooldownMult?: number;
  resourceOutputMult?: {
    farm?: number;
    fish?: number;
    iron?: number;
    supply?: number;
    crystal?: number;
    shard?: number;
    oil?: number;
  };
}

export interface TechDef {
  id: string;
  tier?: number;
  rootId?: string;
  name: string;
  description: string;
  requires?: string;
  prereqIds?: string[];
  cost?: {
    gold?: number;
    food?: number;
    iron?: number;
    supply?: number;
    crystal?: number;
    shard?: number;
  };
  researchTimeSeconds?: number;
  mods?: Partial<Record<StatsModKey, number>>;
  effects?: TechEffects;
  grantsPowerup?: { id: string; charges: number };
}

const TechEffectsSchema = z
  .object({
    unlockFarmstead: z.boolean().optional(),
    unlockCamp: z.boolean().optional(),
    unlockMine: z.boolean().optional(),
    unlockMarket: z.boolean().optional(),
    unlockGranary: z.boolean().optional(),
    unlockCensusHall: z.boolean().optional(),
    unlockBank: z.boolean().optional(),
    unlockClearingHouse: z.boolean().optional(),
    unlockCaravanary: z.boolean().optional(),
    unlockWoodenFort: z.boolean().optional(),
    unlockLightOutpost: z.boolean().optional(),
    unlockFurSynthesizer: z.boolean().optional(),
    unlockIronworks: z.boolean().optional(),
    unlockCrystalSynthesizer: z.boolean().optional(),
    unlockSynthOverload: z.boolean().optional(),
    unlockAdvancedSynthesizers: z.boolean().optional(),
    unlockFuelPlant: z.boolean().optional(),
    unlockFoundry: z.boolean().optional(),
    unlockAetherTower: z.boolean().optional(),
    unlockExchangeHouse: z.boolean().optional(),
    unlockCustomsHouse: z.boolean().optional(),
    unlockHarborLocksUpgrade: z.boolean().optional(),
    unlockCharteredPortsUpgrade: z.boolean().optional(),
    unlockRailDepot: z.boolean().optional(),
    unlockGovernorsOffice: z.boolean().optional(),
    unlockGarrisonHall: z.boolean().optional(),
    unlockAirport: z.boolean().optional(),
    unlockRadarSystem: z.boolean().optional(),
    unlockImperialExchange: z.boolean().optional(),
    unlockWorldEngine: z.boolean().optional(),
    unlockAegisDome: z.boolean().optional(),
    unlockAegisLock: z.boolean().optional(),
    unlockAstralDock: z.boolean().optional(),
    unlockAstralDockLaunch: z.boolean().optional(),
    unlockStormfront: z.boolean().optional(),
    unlockForts: z.boolean().optional(),
    unlockObservatory: z.boolean().optional(),
    unlockSiegeOutposts: z.boolean().optional(),
    unlockRevealRegion: z.boolean().optional(),
    unlockRevealEmpire: z.boolean().optional(),
    unlockRevealEmpireStats: z.boolean().optional(),
    unlockDeepStrike: z.boolean().optional(),
    unlockNavalInfiltration: z.boolean().optional(),
    unlockAetherWall: z.boolean().optional(),
    unlockSabotage: z.boolean().optional(),
    unlockSurveySweep: z.boolean().optional(),
    unlockAetherLance: z.boolean().optional(),
    unlockRetortRecasting: z.boolean().optional(),
    unlockTerrainShaping: z.boolean().optional(),
    unlockIronBastion: z.boolean().optional(),
    unlockSiegeTower: z.boolean().optional(),
    unlockThunderBastion: z.boolean().optional(),
    unlockDreadTower: z.boolean().optional(),
    unlockWaterworksUpgrade: z.boolean().optional(),
    unlockAetherEmp: z.boolean().optional(),
    unlockCityOverclock: z.boolean().optional(),
    settlementSpeedMult: z.number().positive().optional(),
    operationalTempoMult: z.number().positive().optional(),
    researchTimeMult: z.number().positive().optional(),
    abilityCooldownMult: z.number().positive().optional(),
    populationGrowthMult: z.number().positive().optional(),
    firstThreeTownsPopulationGrowthMult: z.number().positive().optional(),
    firstThreeTownsGoldOutputMult: z.number().positive().optional(),
    populationCapFirst3TownsMult: z.number().positive().optional(),
    growthPauseDurationMult: z.number().positive().optional(),
    townFoodUpkeepMult: z.number().positive().optional(),
    settledFoodUpkeepMult: z.number().positive().optional(),
    settledGoldUpkeepMult: z.number().positive().optional(),
    townGoldOutputMult: z.number().positive().optional(),
    townGoldCapMult: z.number().positive().optional(),
    marketBonusMult: z.number().positive().optional(),
    granaryBonusMult: z.number().positive().optional(),
    marketIncomeBonusAdd: z.number().nonnegative().optional(),
    marketCapBonusAdd: z.number().nonnegative().optional(),
    granaryCapBonusAdd: z.number().nonnegative().optional(),
    granaryCapBonusAddPctPoints: z.number().nonnegative().optional(),
    populationIncomeMult: z.number().positive().optional(),
    connectedTownStepBonusAdd: z.number().nonnegative().optional(),
    harvestCapMult: z.number().positive().optional(),
    fortDefenseMult: z.number().positive().optional(),
    fortIronUpkeepMult: z.number().positive().optional(),
    fortGoldUpkeepMult: z.number().positive().optional(),
    outpostAttackMult: z.number().positive().optional(),
    outpostSupplyUpkeepMult: z.number().positive().optional(),
    outpostGoldUpkeepMult: z.number().positive().optional(),
    revealUpkeepMult: z.number().positive().optional(),
    revealCapacityBonus: z.number().int().min(0).optional(),
    visionRadiusBonus: z.number().int().min(0).optional(),
    observatoryRangeBonus: z.number().int().min(0).optional(),
    observatoryProtectionRadiusBonus: z.number().int().min(0).optional(),
    observatoryCastRadiusBonus: z.number().int().min(0).optional(),
    buildCapacityAdd: z.number().int().min(0).optional(),
    developmentProcessCapacityAdd: z.number().int().optional(),
    dockGoldOutputMult: z.number().positive().optional(),
    dockGoldCapMult: z.number().positive().optional(),
    dockConnectionBonusPerLink: z.number().nonnegative().optional(),
    dockRoutesVisible: z.boolean().optional(),
    supportEconomicFoodUpkeepMult: z.number().positive().optional(),
    frontierDefenseAdd: z.number().nonnegative().optional(),
    settledDefenseMult: z.number().positive().optional(),
    attackVsSettledMult: z.number().positive().optional(),
    attackVsFortsMult: z.number().positive().optional(),
    newSettlementDefenseMult: z.number().positive().optional(),
    sabotageCooldownMult: z.number().positive().optional(),
    resourceOutputMult: z
      .object({
        farm: z.number().positive().optional(),
        fish: z.number().positive().optional(),
        iron: z.number().positive().optional(),
        supply: z.number().positive().optional(),
        crystal: z.number().positive().optional(),
        shard: z.number().positive().optional(),
        oil: z.number().positive().optional()
      })
      .partial()
      .optional()
  })
  .partial()
  .optional();

const TechSchema = z.object({
  id: z.string().min(1),
  tier: z.number().int().min(1).max(7).optional(),
  rootId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  requires: z.string().min(1).optional(),
  prereqIds: z.array(z.string().min(1)).optional(),
  cost: z
    .object({
      gold: z.number().nonnegative().optional(),
      food: z.number().nonnegative().optional(),
      iron: z.number().nonnegative().optional(),
      supply: z.number().nonnegative().optional(),
      crystal: z.number().nonnegative().optional(),
      shard: z.number().nonnegative().optional(),
      oil: z.number().nonnegative().optional()
    })
    .optional(),
  researchTimeSeconds: z.number().int().positive().optional(),
  mods: z
    .object({
      attack: z.number().positive().optional(),
      defense: z.number().positive().optional(),
      income: z.number().positive().optional(),
      vision: z.number().positive().optional()
    })
    .partial()
    .optional(),
  effects: TechEffectsSchema,
  grantsPowerup: z
    .object({
      id: z.string().min(1),
      charges: z.number().int().positive()
    })
    .optional()
});

const TechFileSchema = z.object({
  version: z.number().int().positive(),
  techs: z.array(TechSchema).min(1)
});

export interface LoadedTechTree {
  techs: TechDef[];
  techById: Map<string, TechDef>;
  childrenByTech: Map<string, string[]>;
  roots: string[];
}

export const loadTechTree = (cwd: string): LoadedTechTree => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(cwd, "packages/server/data/tech-tree.json"),
    path.resolve(moduleDir, "../data/tech-tree.json"),
    path.resolve(cwd, "data/tech-tree.json")
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) throw new Error(`tech-tree.json not found. tried: ${candidates.join(", ")}`);

  const parsed = TechFileSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
  const techs = parsed.techs as TechDef[];
  const techById = new Map<string, TechDef>();
  const childrenByTech = new Map<string, string[]>();

  for (const tech of techs) {
    if (techById.has(tech.id)) throw new Error(`Duplicate tech id: ${tech.id}`);
    techById.set(tech.id, tech);
  }

  for (const tech of techs) {
    const parents = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
    for (const parentId of parents) {
      if (!techById.has(parentId)) throw new Error(`Tech ${tech.id} references missing parent ${parentId}`);
      const children = childrenByTech.get(parentId) ?? [];
      children.push(tech.id);
      childrenByTech.set(parentId, children);
    }
  }

  const roots = techs.filter((t) => !(t.prereqIds?.length) && !t.requires).map((t) => t.id);
  if (roots.length === 0) throw new Error("Tech tree has no entry nodes (no nodes without prerequisites)");

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Tech cycle detected at ${id}`);
    visiting.add(id);
    for (const child of childrenByTech.get(id) ?? []) dfs(child);
    visiting.delete(id);
    visited.add(id);
  };

  for (const rootId of roots) dfs(rootId);
  if (visited.size !== techs.length) {
    throw new Error(`Tech graph has cycle or disconnected component: visited ${visited.size} / ${techs.length}`);
  }

  return { techs, techById, childrenByTech, roots };
};
