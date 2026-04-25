import type { Dock, Player, Tile, TileKey } from "@border-empires/shared";

import type { StrategicResource, TownDefinition } from "./server-shared-types.js";
import type { ServerTownEconomyRuntime, ServerTownEconomyRuntimeDeps } from "./server-town-runtime-types.js";

export const createServerTownEconomyRuntime = (deps: ServerTownEconomyRuntimeDeps): ServerTownEconomyRuntime => {
  const {
    now,
    key,
    parseKey,
    resourceAt,
    players,
    townsByTile,
    docksByTile,
    economicStructuresByTile,
    ownership,
    ownershipStateByTile,
    townCaptureShockUntilByTile,
    townGrowthShockUntilByTile,
    foodUpkeepCoverageByPlayer,
    townFeedingStateByPlayer,
    growthPausedUntilByPlayer,
    getPlayerEffectsForPlayer,
    emptyPlayerEffects,
    getOrInitStrategicStocks,
    availableYieldStrategicForPlayer,
    governorUpkeepMultiplierAtTile,
    townPopulationTierForTown,
    townPopulationMultiplier,
    townSupport,
    townGoldIncomeEnabledForPlayer,
    ownedTownKeysForPlayer,
    firstThreeTownKeySetForPlayer,
    structureForSupportedTown,
    structureForSupportedDock,
    POPULATION_MAX,
    POPULATION_GROWTH_BASE_RATE,
    POPULATION_GROWTH_TICK_MS,
    GROWTH_PAUSE_MS,
    GROWTH_PAUSE_MAX_MS,
    TOWN_BASE_GOLD_PER_MIN,
    SETTLEMENT_BASE_GOLD_PER_MIN,
    DOCK_INCOME_PER_MIN,
    TILE_YIELD_CAP_GOLD,
    TILE_YIELD_CAP_RESOURCE,
    PASSIVE_INCOME_MULT,
    HARVEST_GOLD_RATE_MULT,
    resourceRate,
    toStrategicResource,
    strategicDailyFromResource,
    converterStructureOutputFor,
    siphonMultiplierAt
  } = deps;

  const computeTownFeedingState = (playerId: string, availableFood: number): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
    const player = players.get(playerId);
    if (!player) return { foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1, fedTownKeys: new Set() };
    const effects = getPlayerEffectsForPlayer(playerId);
    let upkeepNeed = 0;
    for (const townKey of ownedTownKeysForPlayer(playerId)) {
      const town = townsByTile.get(townKey);
      if (!town) continue;
      upkeepNeed += townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult * governorUpkeepMultiplierAtTile(playerId, townKey);
    }
    let remainingFood = Math.max(0, availableFood);
    const fedTownKeys = new Set<TileKey>();
    for (const townKey of ownedTownKeysForPlayer(playerId)) {
      const town = townsByTile.get(townKey);
      if (!town) continue;
      const townNeed = townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult * governorUpkeepMultiplierAtTile(playerId, townKey);
      if (townNeed <= 0) {
        fedTownKeys.add(townKey);
      } else if (remainingFood + 1e-9 >= townNeed) {
        fedTownKeys.add(townKey);
        remainingFood = Math.max(0, remainingFood - townNeed);
      }
    }
    return { foodCoverage: upkeepNeed <= 0 ? 1 : Math.max(0, Math.min(1, Math.max(0, availableFood) / upkeepNeed)), fedTownKeys };
  };

  const townFeedingStateForPlayer = (playerId: string): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
    const cached = townFeedingStateByPlayer.get(playerId);
    if (cached) return cached;
    const player = players.get(playerId);
    if (!player) return { foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1, fedTownKeys: new Set() };
    const stock = getOrInitStrategicStocks(playerId);
    return computeTownFeedingState(playerId, Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD"));
  };

  const isTownFedForOwner = (townKey: TileKey, ownerId: string | undefined): boolean =>
    Boolean(ownerId && townFeedingStateForPlayer(ownerId).fedTownKeys.has(townKey));

  const townIncomeSuppressed = (townKey: TileKey): boolean => (townCaptureShockUntilByTile.get(townKey) ?? 0) > now();
  const townGrowthSuppressed = (townKey: TileKey): boolean =>
    (townCaptureShockUntilByTile.get(townKey) ?? 0) > now() || (townGrowthShockUntilByTile.get(townKey) ?? 0) > now();

  const marketIncomeMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedTown(tileKey, ownerId, "MARKET");
    if (!structure || structure.status !== "active" || !isTownFedForOwner(tileKey, ownerId)) return 1;
    return 1 + (ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects()).marketIncomeBonusAdd;
  };

  const marketCapMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedTown(tileKey, ownerId, "MARKET");
    if (!structure || structure.status !== "active" || !isTownFedForOwner(tileKey, ownerId)) return 1;
    return 1 + (ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects()).marketCapBonusAdd;
  };

  const granaryGrowthMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedTown(tileKey, ownerId, "GRANARY");
    if (!structure || structure.status !== "active") return 1;
    return 1 + (ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects()).granaryCapBonusAdd;
  };

  const bankIncomeMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedTown(tileKey, ownerId, "BANK");
    return structure && structure.status === "active" ? 1.5 : 1;
  };

  const bankFlatIncomeBonusAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedTown(tileKey, ownerId, "BANK");
    return structure && structure.status === "active" ? 1 : 0;
  };

  const dockConnectedOwnedSettledCount = (dock: Dock, ownerId: string | undefined): number => {
    if (!ownerId) return 0;
    let count = 0;
    for (const dockId of dock.connectedDockIds?.length ? dock.connectedDockIds : [dock.pairedDockId]) {
      const linked = deps.dockById.get(dockId);
      if (!linked) continue;
      if (ownership.get(linked.tileKey) !== ownerId || ownershipStateByTile.get(linked.tileKey) !== "SETTLED") continue;
      count += 1;
    }
    return count;
  };

  const dockCustomsHouseIncomeMultiplierAt = (dockKey: TileKey, ownerId: string | undefined): number => {
    const structure = structureForSupportedDock(dockKey, ownerId, "CUSTOMS_HOUSE");
    return structure && structure.status === "active" ? 1.5 : 1;
  };

  const dockGoldRateMultiplierForOwner = (ownerId: string | undefined): number =>
    (ownerId ? players.get(ownerId)?.mods.income ?? 1 : 1) * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;

  const dockSummaryForOwner = (dock: Dock, ownerId: string | undefined): Tile["dock"] | undefined => {
    if (!ownerId || ownership.get(dock.tileKey) !== ownerId || ownershipStateByTile.get(dock.tileKey) !== "SETTLED") return undefined;
    const effects = getPlayerEffectsForPlayer(ownerId);
    const connectedDockCount = dockConnectedOwnedSettledCount(dock, ownerId);
    const outputMult = effects.dockGoldOutputMult;
    const connectionMult = 1 + effects.dockConnectionBonusPerLink * connectedDockCount;
    const customsMult = dockCustomsHouseIncomeMultiplierAt(dock.tileKey, ownerId);
    const rateMult = dockGoldRateMultiplierForOwner(ownerId);
    const baseGoldPerMinute = DOCK_INCOME_PER_MIN * rateMult;
    const modifiers: NonNullable<Tile["dock"]>["modifiers"] = [];
    const pushModifier = (label: string, percent: number, deltaGoldPerMinute: number): void => {
      if (deltaGoldPerMinute <= 0.0001 || percent <= 0) return;
      modifiers.push({ label, percent, deltaGoldPerMinute: Number(deltaGoldPerMinute.toFixed(4)) });
    };
    pushModifier("Dock income bonus", (outputMult - 1) * 100, DOCK_INCOME_PER_MIN * (outputMult - 1) * rateMult);
    pushModifier(connectedDockCount === 1 ? "Connected dock route" : "Connected dock routes", (connectionMult - 1) * 100, DOCK_INCOME_PER_MIN * outputMult * (connectionMult - 1) * rateMult);
    pushModifier("Customs House", (customsMult - 1) * 100, DOCK_INCOME_PER_MIN * outputMult * connectionMult * (customsMult - 1) * rateMult);
    return {
      baseGoldPerMinute: Number(baseGoldPerMinute.toFixed(4)),
      goldPerMinute: Number((DOCK_INCOME_PER_MIN * outputMult * connectionMult * customsMult * rateMult).toFixed(4)),
      connectedDockCount,
      ...(modifiers.length > 0 ? { modifiers } : {})
    };
  };

  const dockIncomeForOwner = (dock: Dock, ownerId: string | undefined): number => {
    if (!ownerId || ownership.get(dock.tileKey) !== ownerId || ownershipStateByTile.get(dock.tileKey) !== "SETTLED") return 0;
    const effects = getPlayerEffectsForPlayer(ownerId);
    return DOCK_INCOME_PER_MIN * effects.dockGoldOutputMult * (1 + effects.dockConnectionBonusPerLink * dockConnectedOwnedSettledCount(dock, ownerId)) * dockCustomsHouseIncomeMultiplierAt(dock.tileKey, ownerId);
  };

  const dockCapForOwner = (dock: Dock, ownerId: string | undefined): number =>
    !ownerId ? TILE_YIELD_CAP_GOLD : dockIncomeForOwner(dock, ownerId) * 60 * 8 * getPlayerEffectsForPlayer(ownerId).dockGoldCapMult;

  const townPotentialIncomeForOwner = (town: TownDefinition, ownerId: string | undefined, options?: { ignoreSuppression?: boolean; ignoreManpowerGate?: boolean }): number => {
    if (!ownerId || ownership.get(town.tileKey) !== ownerId || ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
    if (!options?.ignoreSuppression && townIncomeSuppressed(town.tileKey)) return 0;
    const owner = players.get(ownerId);
    if (!owner || (!options?.ignoreManpowerGate && !townGoldIncomeEnabledForPlayer(owner))) return 0;
    if (townPopulationTierForTown(town) === "SETTLEMENT") return SETTLEMENT_BASE_GOLD_PER_MIN;
    const { supportCurrent, supportMax } = townSupport(town.tileKey, ownerId);
    if (!isTownFedForOwner(town.tileKey, ownerId)) return 0;
    const effects = getPlayerEffectsForPlayer(ownerId);
    const supportRatio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
    return (
      TOWN_BASE_GOLD_PER_MIN *
      supportRatio *
      townPopulationMultiplier(town.population) *
      (1 + town.connectedTownBonus) *
      marketIncomeMultiplierAt(town.tileKey, ownerId) *
      bankIncomeMultiplierAt(town.tileKey, ownerId) *
      (firstThreeTownKeySetForPlayer(ownerId).has(town.tileKey) ? effects.firstThreeTownsGoldOutputMult : 1) *
      effects.townGoldOutputMult *
      effects.populationIncomeMult
    ) + bankFlatIncomeBonusAt(town.tileKey, ownerId);
  };

  const townIncomeForOwner = (town: TownDefinition, ownerId: string | undefined): number => townPotentialIncomeForOwner(town, ownerId);

  const townCapForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
    if (!ownerId) return TILE_YIELD_CAP_GOLD;
    const income = townPotentialIncomeForOwner(town, ownerId, { ignoreSuppression: true, ignoreManpowerGate: true });
    return townPopulationTierForTown(town) === "SETTLEMENT" ? income * 60 * 8 : income * 60 * 8 * getPlayerEffectsForPlayer(ownerId).townGoldCapMult * marketCapMultiplierAt(town.tileKey, ownerId);
  };

  const townFoodUpkeepPerMinute = (town: TownDefinition): number => {
    if (town.isSettlement) return 0;
    const tier = townPopulationTierForTown(town);
    if (tier === "SETTLEMENT") return 0;
    if (tier === "CITY") return 0.2;
    if (tier === "GREAT_CITY") return 0.4;
    if (tier === "METROPOLIS") return 0.8;
    return 0.1;
  };

  const pausePopulationGrowthFromWar = (playerId: string): void => {
    const pauseMs = Math.round(GROWTH_PAUSE_MS * getPlayerEffectsForPlayer(playerId).growthPauseDurationMult);
    const baseUntil = Math.max(now(), growthPausedUntilByPlayer.get(playerId) ?? 0);
    growthPausedUntilByPlayer.set(playerId, Math.min(now() + GROWTH_PAUSE_MAX_MS, baseUntil + pauseMs));
  };

  const townMaxPopulationForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
    if (!ownerId) return POPULATION_MAX;
    const effects = getPlayerEffectsForPlayer(ownerId);
    return effects.populationCapFirst3TownsMult > 1 && ownedTownKeysForPlayer(ownerId).slice(0, 3).includes(town.tileKey)
      ? Math.round(POPULATION_MAX * effects.populationCapFirst3TownsMult)
      : POPULATION_MAX;
  };

  const baseTownPopulationGrowthPerMinuteForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
    if (!ownerId || ownership.get(town.tileKey) !== ownerId || ownershipStateByTile.get(town.tileKey) !== "SETTLED" || !isTownFedForOwner(town.tileKey, ownerId)) return 0;
    const effects = getPlayerEffectsForPlayer(ownerId);
    const populationTier = townPopulationTierForTown(town);
    const growthMult = effects.populationGrowthMult * (firstThreeTownKeySetForPlayer(ownerId).has(town.tileKey) ? effects.firstThreeTownsPopulationGrowthMult : 1) * granaryGrowthMultiplierAt(town.tileKey, ownerId) * (populationTier === "SETTLEMENT" ? 4 : 1);
    const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
    return logisticFactor <= 0 ? 0 : town.population * POPULATION_GROWTH_BASE_RATE * growthMult * logisticFactor;
  };

  const townGrowthModifiersForOwner = (town: TownDefinition, ownerId: string | undefined): Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }> => {
    const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, ownerId);
    if (baseGrowth <= 0) return [];
    if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) return [{ label: "Recently captured", deltaPerMinute: -baseGrowth }];
    if ((townGrowthShockUntilByTile.get(town.tileKey) ?? 0) > now()) return [{ label: "Nearby war", deltaPerMinute: -baseGrowth }];
    return [{ label: "Long time peace", deltaPerMinute: baseGrowth }];
  };

  const updateTownPopulationForPlayer = (player: Player): Set<TileKey> => {
    const touched = new Set<TileKey>();
    for (const tk of ownedTownKeysForPlayer(player.id)) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      const elapsedMinutes = Math.floor((now() - town.lastGrowthTickAt) / POPULATION_GROWTH_TICK_MS);
      if (elapsedMinutes <= 0) continue;
      town.lastGrowthTickAt += elapsedMinutes * POPULATION_GROWTH_TICK_MS;
      town.maxPopulation = townMaxPopulationForOwner(town, player.id);
      const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, player.id);
      const growth = baseGrowth <= 0 || townGrowthSuppressed(tk) ? 0 : baseGrowth * 2 * elapsedMinutes;
      if (growth <= 0) continue;
      town.population = Math.min(town.maxPopulation, town.population + growth);
      touched.add(tk);
    }
    return touched;
  };

  const townPopulationGrowthPerMinuteForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
    const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, ownerId);
    return baseGrowth <= 0 || townGrowthSuppressed(town.tileKey) ? 0 : baseGrowth * 2;
  };

  const tileYieldCapsFor = (tileKey: TileKey, ownerId: string | undefined): { gold: number; strategicEach: number } => {
    const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
    if (!ownerId) return { gold: TILE_YIELD_CAP_GOLD * effects.harvestCapMult, strategicEach: TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult };
    const [x, y] = parseKey(tileKey);
    const resource = resourceAt(x, y);
    const dock = docksByTile.get(tileKey);
    const town = townsByTile.get(tileKey);
    const sabotageMult = siphonMultiplierAt(tileKey);
    const goldPerMinute = (((resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) + (dock ? dockIncomeForOwner(dock, ownerId) : 0) + (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) * (players.get(ownerId)?.mods.income ?? 1) * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT);
    const strategicResource = toStrategicResource(resource);
    const strategicBaseDaily = strategicResource && resource ? strategicDailyFromResource[resource] ?? 0 : 0;
    const structure = economicStructuresByTile.get(tileKey);
    const converterDaily = structure && structure.ownerId === ownerId && structure.status === "active" ? converterStructureOutputFor(structure.type, ownerId) : undefined;
    const converterMaxDaily = converterDaily ? Math.max(0, ...(Object.values(converterDaily) as number[])) : 0;
    return {
      gold: town ? townCapForOwner(town, ownerId) : dock ? dockCapForOwner(dock, ownerId) : goldPerMinute > 0 ? goldPerMinute * 60 * 8 : TILE_YIELD_CAP_GOLD * effects.harvestCapMult,
      strategicEach: strategicBaseDaily > 0 ? strategicBaseDaily / 3 : converterMaxDaily > 0 ? converterMaxDaily / 3 : TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult
    };
  };

  return {
    computeTownFeedingState,
    townFeedingStateForPlayer,
    isTownFedForOwner,
    townIncomeSuppressed,
    townGrowthSuppressed,
    dockSummaryForOwner,
    dockIncomeForOwner,
    dockCapForOwner,
    townPotentialIncomeForOwner,
    townIncomeForOwner,
    townCapForOwner,
    townFoodUpkeepPerMinute,
    pausePopulationGrowthFromWar,
    townGrowthModifiersForOwner,
    updateTownPopulationForPlayer,
    townPopulationGrowthPerMinuteForOwner,
    tileYieldCapsFor
  };
};
