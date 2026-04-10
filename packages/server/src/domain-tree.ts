import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type DomainModKey = "attack" | "defense" | "income" | "vision";
export type DomainResourceKey = "gold" | "food" | "iron" | "supply" | "crystal" | "shard";

export interface DomainEffects {
  unlockRevealEmpire?: boolean;
  buildCapacityAdd?: number;
  developmentProcessCapacityAdd?: number;
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
  connectedTownStepBonusAdd?: number;
  harvestCapMult?: number;
  goldCollectionEfficiencyMult?: number;
  allGoldUpkeepMult?: number;
  fortBuildGoldCostMult?: number;
  fortDefenseMult?: number;
  fortIronUpkeepMult?: number;
  settledDefenseNearFortMult?: number;
  fortGoldUpkeepMult?: number;
  outpostAttackMult?: number;
  outpostSupplyUpkeepMult?: number;
  outpostGoldUpkeepMult?: number;
  outpostDeploymentSpeedMult?: number;
  revealUpkeepMult?: number;
  revealCapacityBonus?: number;
  visionRadiusBonus?: number;
  observatoryProtectionRadiusBonus?: number;
  observatoryCastRadiusBonus?: number;
  observatoryVisionBonus?: number;
  frontierDefenseAdd?: number;
  settledDefenseMult?: number;
  attackVsSettledMult?: number;
  attackVsFortsMult?: number;
  newSettlementDefenseMult?: number;
  dockGoldOutputMult?: number;
  dockGoldCapMult?: number;
  supportEconomicFoodUpkeepMult?: number;
  sabotageCooldownMult?: number;
  resourceOutputMult?: {
    farm?: number;
    fish?: number;
    iron?: number;
    supply?: number;
    crystal?: number;
    shard?: number;
  };
}

export interface DomainDef {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  cost: Partial<Record<DomainResourceKey, number>>;
  mods?: Partial<Record<DomainModKey, number>>;
  effects?: DomainEffects;
}

const DomainEffectsSchema = z
  .object({
    unlockRevealEmpire: z.boolean().optional(),
    buildCapacityAdd: z.number().int().optional(),
    developmentProcessCapacityAdd: z.number().int().optional(),
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
    connectedTownStepBonusAdd: z.number().nonnegative().optional(),
    harvestCapMult: z.number().positive().optional(),
    goldCollectionEfficiencyMult: z.number().positive().optional(),
    allGoldUpkeepMult: z.number().positive().optional(),
    fortBuildGoldCostMult: z.number().positive().optional(),
    fortDefenseMult: z.number().positive().optional(),
    fortIronUpkeepMult: z.number().positive().optional(),
    settledDefenseNearFortMult: z.number().positive().optional(),
    fortGoldUpkeepMult: z.number().positive().optional(),
    outpostAttackMult: z.number().positive().optional(),
    outpostSupplyUpkeepMult: z.number().positive().optional(),
    outpostGoldUpkeepMult: z.number().positive().optional(),
    outpostDeploymentSpeedMult: z.number().positive().optional(),
    revealUpkeepMult: z.number().positive().optional(),
    revealCapacityBonus: z.number().int().min(0).optional(),
    visionRadiusBonus: z.number().int().min(0).optional(),
    observatoryProtectionRadiusBonus: z.number().int().min(0).optional(),
    observatoryCastRadiusBonus: z.number().int().min(0).optional(),
    observatoryVisionBonus: z.number().int().min(0).optional(),
    frontierDefenseAdd: z.number().nonnegative().optional(),
    settledDefenseMult: z.number().positive().optional(),
    attackVsSettledMult: z.number().positive().optional(),
    attackVsFortsMult: z.number().positive().optional(),
    newSettlementDefenseMult: z.number().positive().optional(),
    dockGoldOutputMult: z.number().positive().optional(),
    dockGoldCapMult: z.number().positive().optional(),
    supportEconomicFoodUpkeepMult: z.number().positive().optional(),
    sabotageCooldownMult: z.number().positive().optional(),
    resourceOutputMult: z
      .object({
        farm: z.number().positive().optional(),
        fish: z.number().positive().optional(),
        iron: z.number().positive().optional(),
        supply: z.number().positive().optional(),
        crystal: z.number().positive().optional(),
        shard: z.number().positive().optional()
      })
      .partial()
      .optional()
  })
  .partial()
  .optional();

const DomainSchema = z.object({
  id: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  name: z.string().min(1),
  description: z.string().min(1),
  requiresTechId: z.string().min(1),
  cost: z
    .object({
      gold: z.number().nonnegative().optional(),
      food: z.number().nonnegative().optional(),
      iron: z.number().nonnegative().optional(),
      supply: z.number().nonnegative().optional(),
      crystal: z.number().nonnegative().optional(),
      shard: z.number().nonnegative().optional()
    })
    .partial(),
  mods: z
    .object({
      attack: z.number().positive().optional(),
      defense: z.number().positive().optional(),
      income: z.number().positive().optional(),
      vision: z.number().positive().optional()
    })
    .partial()
    .optional(),
  effects: DomainEffectsSchema
});

const DomainFileSchema = z.object({
  version: z.number().int().positive(),
  domains: z.array(DomainSchema).min(1)
});

export interface LoadedDomainTree {
  domains: DomainDef[];
  domainById: Map<string, DomainDef>;
}

export const loadDomainTree = (cwd: string): LoadedDomainTree => {
  const candidates = [path.resolve(cwd, "data/domain-tree.json"), path.resolve(cwd, "packages/server/data/domain-tree.json")];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) throw new Error(`domain-tree.json not found. tried: ${candidates.join(", ")}`);

  const parsed = DomainFileSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
  const domainById = new Map<string, DomainDef>();

  const domains: DomainDef[] = [];
  for (const d of parsed.domains) {
    const cost: DomainDef["cost"] = {};
    if (typeof d.cost.gold === "number") cost.gold = d.cost.gold;
    if (typeof d.cost.food === "number") cost.food = d.cost.food;
    if (typeof d.cost.iron === "number") cost.iron = d.cost.iron;
    if (typeof d.cost.supply === "number") cost.supply = d.cost.supply;
    if (typeof d.cost.crystal === "number") cost.crystal = d.cost.crystal;
    if (typeof d.cost.shard === "number") cost.shard = d.cost.shard;

    const normalized: DomainDef = {
      id: d.id,
      tier: d.tier,
      name: d.name,
      description: d.description,
      requiresTechId: d.requiresTechId,
      cost,
    };
    if (d.mods) {
      const mods: NonNullable<DomainDef["mods"]> = {};
      if (typeof d.mods.attack === "number") mods.attack = d.mods.attack;
      if (typeof d.mods.defense === "number") mods.defense = d.mods.defense;
      if (typeof d.mods.income === "number") mods.income = d.mods.income;
      if (typeof d.mods.vision === "number") mods.vision = d.mods.vision;
      if (Object.keys(mods).length > 0) normalized.mods = mods;
    }
    if (d.effects) {
      const effects: NonNullable<DomainDef["effects"]> = {};
      if (typeof d.effects.unlockRevealEmpire === "boolean") effects.unlockRevealEmpire = d.effects.unlockRevealEmpire;
      if (typeof d.effects.buildCapacityAdd === "number") effects.buildCapacityAdd = d.effects.buildCapacityAdd;
      if (typeof d.effects.developmentProcessCapacityAdd === "number") {
        effects.developmentProcessCapacityAdd = d.effects.developmentProcessCapacityAdd;
      }
      if (typeof d.effects.settlementSpeedMult === "number") effects.settlementSpeedMult = d.effects.settlementSpeedMult;
      if (typeof d.effects.operationalTempoMult === "number") effects.operationalTempoMult = d.effects.operationalTempoMult;
      if (typeof d.effects.researchTimeMult === "number") effects.researchTimeMult = d.effects.researchTimeMult;
      if (typeof d.effects.abilityCooldownMult === "number") effects.abilityCooldownMult = d.effects.abilityCooldownMult;
      if (typeof d.effects.populationGrowthMult === "number") effects.populationGrowthMult = d.effects.populationGrowthMult;
      if (typeof d.effects.firstThreeTownsPopulationGrowthMult === "number") {
        effects.firstThreeTownsPopulationGrowthMult = d.effects.firstThreeTownsPopulationGrowthMult;
      }
      if (typeof d.effects.firstThreeTownsGoldOutputMult === "number") {
        effects.firstThreeTownsGoldOutputMult = d.effects.firstThreeTownsGoldOutputMult;
      }
      if (typeof d.effects.populationCapFirst3TownsMult === "number") effects.populationCapFirst3TownsMult = d.effects.populationCapFirst3TownsMult;
      if (typeof d.effects.growthPauseDurationMult === "number") effects.growthPauseDurationMult = d.effects.growthPauseDurationMult;
      if (typeof d.effects.townFoodUpkeepMult === "number") effects.townFoodUpkeepMult = d.effects.townFoodUpkeepMult;
      if (typeof d.effects.settledFoodUpkeepMult === "number") effects.settledFoodUpkeepMult = d.effects.settledFoodUpkeepMult;
      if (typeof d.effects.settledGoldUpkeepMult === "number") effects.settledGoldUpkeepMult = d.effects.settledGoldUpkeepMult;
      if (typeof d.effects.townGoldOutputMult === "number") effects.townGoldOutputMult = d.effects.townGoldOutputMult;
      if (typeof d.effects.townGoldCapMult === "number") effects.townGoldCapMult = d.effects.townGoldCapMult;
      if (typeof d.effects.marketBonusMult === "number") effects.marketBonusMult = d.effects.marketBonusMult;
      if (typeof d.effects.granaryBonusMult === "number") effects.granaryBonusMult = d.effects.granaryBonusMult;
      if (typeof d.effects.connectedTownStepBonusAdd === "number") effects.connectedTownStepBonusAdd = d.effects.connectedTownStepBonusAdd;
      if (typeof d.effects.harvestCapMult === "number") effects.harvestCapMult = d.effects.harvestCapMult;
      if (typeof d.effects.goldCollectionEfficiencyMult === "number") {
        effects.goldCollectionEfficiencyMult = d.effects.goldCollectionEfficiencyMult;
      }
      if (typeof d.effects.allGoldUpkeepMult === "number") effects.allGoldUpkeepMult = d.effects.allGoldUpkeepMult;
      if (typeof d.effects.fortBuildGoldCostMult === "number") effects.fortBuildGoldCostMult = d.effects.fortBuildGoldCostMult;
      if (typeof d.effects.fortDefenseMult === "number") effects.fortDefenseMult = d.effects.fortDefenseMult;
      if (typeof d.effects.fortIronUpkeepMult === "number") effects.fortIronUpkeepMult = d.effects.fortIronUpkeepMult;
      if (typeof d.effects.settledDefenseNearFortMult === "number") {
        effects.settledDefenseNearFortMult = d.effects.settledDefenseNearFortMult;
      }
      if (typeof d.effects.fortGoldUpkeepMult === "number") effects.fortGoldUpkeepMult = d.effects.fortGoldUpkeepMult;
      if (typeof d.effects.outpostAttackMult === "number") effects.outpostAttackMult = d.effects.outpostAttackMult;
      if (typeof d.effects.outpostSupplyUpkeepMult === "number") effects.outpostSupplyUpkeepMult = d.effects.outpostSupplyUpkeepMult;
      if (typeof d.effects.outpostGoldUpkeepMult === "number") effects.outpostGoldUpkeepMult = d.effects.outpostGoldUpkeepMult;
      if (typeof d.effects.outpostDeploymentSpeedMult === "number") {
        effects.outpostDeploymentSpeedMult = d.effects.outpostDeploymentSpeedMult;
      }
      if (typeof d.effects.revealUpkeepMult === "number") effects.revealUpkeepMult = d.effects.revealUpkeepMult;
      if (typeof d.effects.revealCapacityBonus === "number") effects.revealCapacityBonus = d.effects.revealCapacityBonus;
      if (typeof d.effects.visionRadiusBonus === "number") effects.visionRadiusBonus = d.effects.visionRadiusBonus;
      if (typeof d.effects.observatoryProtectionRadiusBonus === "number") {
        effects.observatoryProtectionRadiusBonus = d.effects.observatoryProtectionRadiusBonus;
      }
      if (typeof d.effects.observatoryCastRadiusBonus === "number") {
        effects.observatoryCastRadiusBonus = d.effects.observatoryCastRadiusBonus;
      }
      if (typeof d.effects.observatoryVisionBonus === "number") {
        effects.observatoryVisionBonus = d.effects.observatoryVisionBonus;
      }
      if (typeof d.effects.frontierDefenseAdd === "number") effects.frontierDefenseAdd = d.effects.frontierDefenseAdd;
      if (typeof d.effects.settledDefenseMult === "number") effects.settledDefenseMult = d.effects.settledDefenseMult;
      if (typeof d.effects.attackVsSettledMult === "number") effects.attackVsSettledMult = d.effects.attackVsSettledMult;
      if (typeof d.effects.attackVsFortsMult === "number") effects.attackVsFortsMult = d.effects.attackVsFortsMult;
      if (typeof d.effects.newSettlementDefenseMult === "number") effects.newSettlementDefenseMult = d.effects.newSettlementDefenseMult;
      if (typeof d.effects.dockGoldOutputMult === "number") effects.dockGoldOutputMult = d.effects.dockGoldOutputMult;
      if (typeof d.effects.dockGoldCapMult === "number") effects.dockGoldCapMult = d.effects.dockGoldCapMult;
      if (typeof d.effects.supportEconomicFoodUpkeepMult === "number") {
        effects.supportEconomicFoodUpkeepMult = d.effects.supportEconomicFoodUpkeepMult;
      }
      if (typeof d.effects.sabotageCooldownMult === "number") effects.sabotageCooldownMult = d.effects.sabotageCooldownMult;
      if (d.effects.resourceOutputMult) {
        const resourceOutputMult: NonNullable<NonNullable<DomainDef["effects"]>["resourceOutputMult"]> = {};
        if (typeof d.effects.resourceOutputMult.farm === "number") resourceOutputMult.farm = d.effects.resourceOutputMult.farm;
        if (typeof d.effects.resourceOutputMult.fish === "number") resourceOutputMult.fish = d.effects.resourceOutputMult.fish;
        if (typeof d.effects.resourceOutputMult.iron === "number") resourceOutputMult.iron = d.effects.resourceOutputMult.iron;
        if (typeof d.effects.resourceOutputMult.supply === "number") resourceOutputMult.supply = d.effects.resourceOutputMult.supply;
        if (typeof d.effects.resourceOutputMult.crystal === "number") resourceOutputMult.crystal = d.effects.resourceOutputMult.crystal;
        if (typeof d.effects.resourceOutputMult.shard === "number") resourceOutputMult.shard = d.effects.resourceOutputMult.shard;
        if (Object.keys(resourceOutputMult).length > 0) effects.resourceOutputMult = resourceOutputMult;
      }
      if (Object.keys(effects).length > 0) normalized.effects = effects;
    }

    if (domainById.has(normalized.id)) throw new Error(`Duplicate domain id: ${normalized.id}`);
    domainById.set(normalized.id, normalized);
    domains.push(normalized);
  }

  return { domains, domainById };
};
