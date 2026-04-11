import type {
  Dock,
  Player,
  ResourceType,
  TileKey
} from "@border-empires/shared";

import type { AbilityDefinition, DynamicMissionDef } from "./server-shared-types.js";
import type { PlayerEffects } from "./server-effects.js";
import type { DomainDef } from "./domain-tree.js";
import type { TechDef } from "./tech-tree.js";

export interface CreateServerPlayerEffectsRuntimeDeps {
  techById: Map<string, TechDef>;
  domainById: Map<string, DomainDef>;
  playerEffectsByPlayer: Map<string, PlayerEffects>;
  revealedEmpireTargetsByPlayer: Map<string, Set<string>>;
  revealWatchersByTarget: Map<string, Set<string>>;
  abilityCooldownsByPlayer: Map<string, Map<AbilityDefinition["id"], number>>;
  dynamicMissionsByPlayer: Map<string, DynamicMissionDef[]>;
  forcedRevealTilesByPlayer: Map<string, Set<TileKey>>;
  temporaryAttackBuffUntilByPlayer: Map<string, number>;
  temporaryIncomeBuffUntilByPlayer: Map<string, { until: number; resources: [ResourceType, ResourceType] }>;
  docksByTile: Map<TileKey, Dock>;
  emptyPlayerEffects: () => PlayerEffects;
  now: () => number;
  VISION_RADIUS: number;
  RESOURCE_CHAIN_MULT: number;
  VENDETTA_ATTACK_BUFF_MULT: number;
  ABILITY_DEFS: Record<AbilityDefinition["id"], AbilityDefinition>;
  markVisibilityDirty: (playerId: string) => void;
  dockLinkedDestinations: (dock: Dock) => Array<{ tileKey: TileKey }>;
  parseKey: (tileKey: TileKey) => [number, number];
  key: (x: number, y: number) => TileKey;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
}

export interface ServerPlayerEffectsRuntime {
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  recomputePlayerEffectsForPlayer: (player: Player) => void;
  revealCapacityForPlayer: (player: Player) => number;
  effectiveVisionRadiusForPlayer: (player: Player) => number;
  getOrInitRevealTargets: (playerId: string) => Set<string>;
  getAbilityCooldowns: (playerId: string) => Map<AbilityDefinition["id"], number>;
  abilityReadyAt: (playerId: string, abilityId: AbilityDefinition["id"]) => number;
  abilityOnCooldown: (playerId: string, abilityId: AbilityDefinition["id"]) => boolean;
  startAbilityCooldown: (playerId: string, abilityId: AbilityDefinition["id"]) => void;
  playerHasTechIds: (player: Player, techIds: string[]) => boolean;
  getOrInitDynamicMissions: (playerId: string) => DynamicMissionDef[];
  getOrInitForcedReveal: (playerId: string) => Set<TileKey>;
  activeAttackBuffMult: (playerId: string) => number;
  revealLinkedDocksForPlayer: (playerId: string, tileKey: TileKey) => void;
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => number;
}

export const createServerPlayerEffectsRuntime = (
  deps: CreateServerPlayerEffectsRuntimeDeps
): ServerPlayerEffectsRuntime => {
  const getPlayerEffectsForPlayer = (playerId: string): PlayerEffects => {
    const existing = deps.playerEffectsByPlayer.get(playerId);
    if (existing) return existing;
    const base = deps.emptyPlayerEffects();
    deps.playerEffectsByPlayer.set(playerId, base);
    return base;
  };

  const applyTechEffects = (next: PlayerEffects, effects: TechDef["effects"] | undefined): void => {
    if (!effects) return;
    if (effects.unlockForts) next.unlockForts = true;
    if (effects.unlockSiegeOutposts) next.unlockSiegeOutposts = true;
    if (effects.unlockWoodenFort) next.unlockWoodenFort = true;
    if (effects.unlockLightOutpost) next.unlockLightOutpost = true;
    if (effects.unlockSynthOverload) next.unlockSynthOverload = true;
    if (effects.unlockAdvancedSynthesizers) next.unlockAdvancedSynthesizers = true;
    if (effects.unlockGranary) next.unlockGranary = true;
    if (effects.unlockRevealRegion) next.unlockRevealRegion = true;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (effects.unlockDeepStrike) next.unlockDeepStrike = true;
    if ((effects as { unlockAetherBridge?: boolean }).unlockAetherBridge) next.unlockAetherBridge = true;
    if (effects.unlockMountainPass) next.unlockMountainPass = true;
    if (effects.unlockTerrainShaping) next.unlockTerrainShaping = true;
    if (effects.unlockBreachAttack) next.unlockBreachAttack = true;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.operationalTempoMult === "number") next.operationalTempoMult *= effects.operationalTempoMult;
    if (typeof effects.researchTimeMult === "number") next.researchTimeMult *= effects.researchTimeMult;
    if (typeof effects.abilityCooldownMult === "number") next.abilityCooldownMult *= effects.abilityCooldownMult;
    if (typeof effects.sabotageCooldownMult === "number") next.sabotageCooldownMult *= effects.sabotageCooldownMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    if (typeof effects.firstThreeTownsGoldOutputMult === "number") next.firstThreeTownsGoldOutputMult *= effects.firstThreeTownsGoldOutputMult;
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.marketIncomeBonusAdd === "number") next.marketIncomeBonusAdd += effects.marketIncomeBonusAdd;
    if (typeof effects.marketCapBonusAdd === "number") next.marketCapBonusAdd += effects.marketCapBonusAdd;
    if (typeof effects.granaryCapBonusAdd === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAdd;
    if (typeof effects.granaryCapBonusAddPctPoints === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAddPctPoints;
    if (typeof effects.populationIncomeMult === "number") next.populationIncomeMult *= effects.populationIncomeMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.developmentProcessCapacityAdd === "number") next.developmentProcessCapacityAdd += effects.developmentProcessCapacityAdd;
    if (typeof effects.dockGoldOutputMult === "number") next.dockGoldOutputMult *= effects.dockGoldOutputMult;
    if (typeof effects.dockGoldCapMult === "number") next.dockGoldCapMult *= effects.dockGoldCapMult;
    if (typeof effects.dockConnectionBonusPerLink === "number") next.dockConnectionBonusPerLink = effects.dockConnectionBonusPerLink;
    if (effects.dockRoutesVisible) next.dockRoutesVisible = true;
    if (typeof effects.supportEconomicFoodUpkeepMult === "number") next.supportEconomicFoodUpkeepMult *= effects.supportEconomicFoodUpkeepMult;
    if (typeof effects.frontierDefenseAdd === "number") next.frontierDefenseAdd += effects.frontierDefenseAdd;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
      if (typeof effects.resourceOutputMult.oil === "number") next.resourceOutputMult.OIL *= effects.resourceOutputMult.oil;
    }
  };

  const applyDomainEffects = (next: PlayerEffects, effects: DomainDef["effects"] | undefined): void => {
    if (!effects) return;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (typeof effects.developmentProcessCapacityAdd === "number") next.developmentProcessCapacityAdd += effects.developmentProcessCapacityAdd;
    if (typeof effects.buildCapacityAdd === "number") next.buildCapacityAdd += effects.buildCapacityAdd;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.operationalTempoMult === "number") next.operationalTempoMult *= effects.operationalTempoMult;
    if (typeof effects.researchTimeMult === "number") next.researchTimeMult *= effects.researchTimeMult;
    if (typeof effects.abilityCooldownMult === "number") next.abilityCooldownMult *= effects.abilityCooldownMult;
    if (typeof effects.sabotageCooldownMult === "number") next.sabotageCooldownMult *= effects.sabotageCooldownMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    if (typeof effects.firstThreeTownsGoldOutputMult === "number") next.firstThreeTownsGoldOutputMult *= effects.firstThreeTownsGoldOutputMult;
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortBuildGoldCostMult === "number") next.fortBuildGoldCostMult *= effects.fortBuildGoldCostMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.observatoryProtectionRadiusBonus === "number") next.observatoryProtectionRadiusBonus += effects.observatoryProtectionRadiusBonus;
    if (typeof effects.observatoryCastRadiusBonus === "number") next.observatoryCastRadiusBonus += effects.observatoryCastRadiusBonus;
    if (typeof effects.observatoryVisionBonus === "number") next.observatoryVisionBonus += effects.observatoryVisionBonus;
    if (typeof effects.frontierDefenseAdd === "number") next.frontierDefenseAdd += effects.frontierDefenseAdd;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.settledDefenseNearFortMult === "number") next.settledDefenseNearFortMult *= effects.settledDefenseNearFortMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (typeof effects.dockGoldOutputMult === "number") next.dockGoldOutputMult *= effects.dockGoldOutputMult;
    if (typeof effects.dockGoldCapMult === "number") next.dockGoldCapMult *= effects.dockGoldCapMult;
    if (typeof effects.supportEconomicFoodUpkeepMult === "number") next.supportEconomicFoodUpkeepMult *= effects.supportEconomicFoodUpkeepMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
    }
  };

  const playerHasTechIds = (player: Player, techIds: string[]): boolean => techIds.every((id) => player.techIds.has(id));

  const getOrInitRevealTargets = (playerId: string): Set<string> => {
    let set = deps.revealedEmpireTargetsByPlayer.get(playerId);
    if (!set) {
      set = new Set<string>();
      deps.revealedEmpireTargetsByPlayer.set(playerId, set);
    }
    return set;
  };

  const recomputePlayerEffectsForPlayer = (player: Player): void => {
    const next = deps.emptyPlayerEffects();
    for (const id of player.techIds) applyTechEffects(next, deps.techById.get(id)?.effects);
    for (const id of player.domainIds) applyDomainEffects(next, deps.domainById.get(id)?.effects);
    deps.playerEffectsByPlayer.set(player.id, next);
  };

  const revealCapacityForPlayer = (player: Player): number => {
    const baseCapacity = playerHasTechIds(player, deps.ABILITY_DEFS.reveal_empire.requiredTechIds) || getOrInitRevealTargets(player.id).size > 0 ? 1 : 0;
    return baseCapacity + getPlayerEffectsForPlayer(player.id).revealCapacityBonus;
  };

  const effectiveVisionRadiusForPlayer = (player: Player): number =>
    Math.max(1, Math.floor(deps.VISION_RADIUS * player.mods.vision) + getPlayerEffectsForPlayer(player.id).visionRadiusBonus);

  const getAbilityCooldowns = (playerId: string): Map<AbilityDefinition["id"], number> => {
    let byAbility = deps.abilityCooldownsByPlayer.get(playerId);
    if (!byAbility) {
      byAbility = new Map();
      deps.abilityCooldownsByPlayer.set(playerId, byAbility);
    }
    return byAbility;
  };

  const abilityReadyAt = (playerId: string, abilityId: AbilityDefinition["id"]): number => getAbilityCooldowns(playerId).get(abilityId) ?? 0;
  const abilityOnCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): boolean => abilityReadyAt(playerId, abilityId) > deps.now();

  const startAbilityCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): void => {
    const def = deps.ABILITY_DEFS[abilityId];
    if (def.cooldownMs <= 0) return;
    const effects = getPlayerEffectsForPlayer(playerId);
    let cooldownMs = def.cooldownMs * effects.abilityCooldownMult;
    if (abilityId === "siphon") cooldownMs *= effects.sabotageCooldownMult;
    getAbilityCooldowns(playerId).set(abilityId, deps.now() + Math.max(1, Math.round(cooldownMs)));
  };

  const getOrInitDynamicMissions = (playerId: string): DynamicMissionDef[] => {
    let missions = deps.dynamicMissionsByPlayer.get(playerId);
    if (!missions) {
      missions = [];
      deps.dynamicMissionsByPlayer.set(playerId, missions);
    }
    return missions;
  };

  const getOrInitForcedReveal = (playerId: string): Set<TileKey> => {
    let set = deps.forcedRevealTilesByPlayer.get(playerId);
    if (!set) {
      set = new Set<TileKey>();
      deps.forcedRevealTilesByPlayer.set(playerId, set);
    }
    return set;
  };

  const activeAttackBuffMult = (playerId: string): number => {
    const until = deps.temporaryAttackBuffUntilByPlayer.get(playerId) ?? 0;
    return until > deps.now() ? deps.VENDETTA_ATTACK_BUFF_MULT : 1;
  };

  const revealLinkedDocksForPlayer = (playerId: string, tileKey: TileKey): void => {
    const dock = deps.docksByTile.get(tileKey);
    if (!dock) return;
    const forced = getOrInitForcedReveal(playerId);
    let changed = false;
    for (const linked of deps.dockLinkedDestinations(dock)) {
      const [x, y] = deps.parseKey(linked.tileKey);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const revealTileKey = deps.key(
            deps.wrapX(x + dx, deps.WORLD_WIDTH),
            deps.wrapY(y + dy, deps.WORLD_HEIGHT)
          );
          if (forced.has(revealTileKey)) continue;
          forced.add(revealTileKey);
          changed = true;
        }
      }
    }
    if (changed) deps.markVisibilityDirty(playerId);
  };

  const activeResourceIncomeMult = (playerId: string, resource: ResourceType): number => {
    const effects = getPlayerEffectsForPlayer(playerId);
    const permanent =
      resource === "FARM"
        ? effects.resourceOutputMult.FARM
        : resource === "FISH"
          ? effects.resourceOutputMult.FISH
          : resource === "IRON"
            ? effects.resourceOutputMult.IRON
            : resource === "GEMS"
              ? effects.resourceOutputMult.CRYSTAL
              : resource === "OIL"
                ? effects.resourceOutputMult.OIL
                : effects.resourceOutputMult.SUPPLY;
    const buff = deps.temporaryIncomeBuffUntilByPlayer.get(playerId);
    if (!buff || buff.until <= deps.now()) return permanent;
    return permanent * (buff.resources.includes(resource) ? deps.RESOURCE_CHAIN_MULT : 1);
  };

  return {
    getPlayerEffectsForPlayer,
    recomputePlayerEffectsForPlayer,
    revealCapacityForPlayer,
    effectiveVisionRadiusForPlayer,
    getOrInitRevealTargets,
    getAbilityCooldowns,
    abilityReadyAt,
    abilityOnCooldown,
    startAbilityCooldown,
    playerHasTechIds,
    getOrInitDynamicMissions,
    getOrInitForcedReveal,
    activeAttackBuffMult,
    revealLinkedDocksForPlayer,
    activeResourceIncomeMult
  };
};
