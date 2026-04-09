import type { EconomicStructureType, Player, Tile, TileKey } from "@border-empires/shared";
import type {
  ServerEconomicOperations,
  ServerEconomicOperationsDeps
} from "./server-economy-types.js";
import type { StrategicResource } from "./server-shared-types.js";

export const createServerEconomicOperations = (deps: ServerEconomicOperationsDeps): ServerEconomicOperations => {
  const {
    now,
    key,
    parseKey,
    playerTile,
    runtimeTileCore,
    players,
    townsByTile,
    docksByTile,
    fortsByTile,
    siegeOutpostsByTile,
    observatoriesByTile,
    economicStructuresByTile,
    economicStructureTileKeysByPlayer,
    economicStructureBuildTimers,
    ownershipStateByTile,
    ownership,
    getOrInitStrategicStocks,
    availableYieldStrategicForPlayer,
    computeTownFeedingState,
    townFeedingStateForPlayer,
    getPlayerEffectsForPlayer,
    isSupportOnlyStructureType,
    isLightCombatStructureType,
    isConverterStructureType,
    supportedTownKeysForTile,
    supportedDockKeysForTile,
    structureForSupportedTown,
    pickRandomAvailableSupportTileForTown,
    townPopulationTier,
    townPopulationTierForTown,
    canStartDevelopmentProcess,
    developmentSlotsBusyReason,
    structureBuildGoldCost,
    structurePlacementMetadata,
    structureShowsOnTile,
    isBorderTile,
    ownedStructureCountForPlayer,
    consumeStrategicResource,
    recalcPlayerDerived,
    markSummaryChunkDirtyAtTile,
    trackOwnedTileKey,
    untrackOwnedTileKey,
    recordTileStructureHistory,
    cancelEconomicStructureBuild,
    discoverOilFieldNearAirport,
    updateOwnership,
    emptyUpkeepDiagnostics,
    consumeYieldStrategicForPlayer,
    consumeYieldGoldForPlayer,
    upkeepPerMinuteForPlayer,
    upkeepContributorsForPlayer,
    foodUpkeepCoverageByPlayer,
    townFeedingStateByPlayer,
    revealedEmpireTargetsByPlayer,
    sendToPlayer,
    getOrInitEconomyIndex,
    applyClusterResources,
    resourceAt,
    resourceRate,
    toStrategicResource,
    strategicDailyFromResource,
    activeResourceIncomeMult,
    hasPositiveStrategicBuffer,
    getOrInitTileYield,
    tileYieldCapsFor,
    syncObservatoriesForPlayer,
    activeSiphonAt,
    addToSiphonCache,
    siphonMultiplierAt,
    converterStructureOutputFor,
    activeAirportAt,
    hostileRadarProtectingTile,
    economicStructureGoldUpkeepPerInterval,
    economicStructureUpkeepDue,
    prettyEconomicStructureLabel,
    economicStructureBuildDurationMs,
    structureBuildDurationMsForRuntime,
    baseSynthTypeForAdvanced,
    economicStructureCrystalUpkeepPerInterval,
    playerEconomySnapshot,
    dockIncomeForOwner,
    townIncomeForOwner,
    FORT_BUILD_MS,
    OBSERVATORY_BUILD_MS,
    SIEGE_OUTPOST_BUILD_MS,
    ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
    PASSIVE_INCOME_MULT,
    HARVEST_GOLD_RATE_MULT,
    HARVEST_RESOURCE_RATE_MULT,
    SIPHON_SHARE
  } = deps;

  const currentFoodCoverageForPlayer = (playerId: string): number => {
    const player = players.get(playerId);
    if (!player) return foodUpkeepCoverageByPlayer.get(playerId) ?? 1;
    return townFeedingStateForPlayer(playerId).foodCoverage;
  };

  const playerHasSettledFoodSources = (playerId: string): boolean => {
    const player = players.get(playerId);
    if (!player) return false;
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const [x, y] = parseKey(tk);
      const resource = playerTile(x, y).resource;
      if (resource === "FARM" || resource === "FISH") return true;
    }
    return false;
  };

  const canPlaceEconomicStructure = (actor: Player, t: Tile, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
    if (t.terrain !== "LAND") return { ok: false, reason: "structure requires land tile" };
    const tk = key(t.x, t.y);
    const upgradeBaseType = baseSynthTypeForAdvanced(structureType);
    const existingStructure = economicStructuresByTile.get(tk);
    const placementMode = structurePlacementMetadata(structureType).placementMode;
    const supportedTowns = supportedTownKeysForTile(tk, actor.id);
    const supportedDocks = supportedDockKeysForTile(tk, actor.id);
    const showsOnTile = structureShowsOnTile(structureType, {
      ownershipState: t.ownershipState,
      resource: t.resource,
      dockId: t.dockId,
      townPopulationTier: townsByTile.get(tk) ? townPopulationTierForTown(townsByTile.get(tk)!) : undefined,
      supportedTownCount: supportedTowns.length,
      supportedDockCount: supportedDocks.length
    });
    if (upgradeBaseType) {
      if (!existingStructure || existingStructure.ownerId !== actor.id || existingStructure.type !== upgradeBaseType) {
        return { ok: false, reason: `${prettyEconomicStructureLabel(structureType).toLowerCase()} must upgrade an existing ${prettyEconomicStructureLabel(upgradeBaseType).toLowerCase()}` };
      }
      if (existingStructure.status !== "active" && existingStructure.status !== "inactive") {
        return { ok: false, reason: `${prettyEconomicStructureLabel(upgradeBaseType).toLowerCase()} is already being modified` };
      }
    }
    if (t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "structure requires settled owned tile" };
    if (!showsOnTile) return { ok: false, reason: `${prettyEconomicStructureLabel(structureType).toLowerCase()} cannot be built on this tile` };
    if (structurePlacementMetadata(structureType).requiresBorder === "border_or_dock" && !docksByTile.has(tk) && !deps.isBorderTile(t.x, t.y, actor.id)) {
      return { ok: false, reason: `${prettyEconomicStructureLabel(structureType).toLowerCase()} must be on border tile or dock` };
    }
    if (structurePlacementMetadata(structureType).requiresBorder === "border" && !deps.isBorderTile(t.x, t.y, actor.id)) {
      return { ok: false, reason: `${prettyEconomicStructureLabel(structureType).toLowerCase()} must be on border tile` };
    }
    const usingTownSource = placementMode === "town_support" && townsByTile.has(tk);
    if (!usingTownSource && (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || (economicStructuresByTile.has(tk) && !upgradeBaseType))) {
      return { ok: false, reason: "tile already has structure" };
    }
    if (structureType === "FARMSTEAD" && t.resource !== "FARM" && t.resource !== "FISH") return { ok: false, reason: "farmstead requires FARM or FISH tile" };
    if (structureType === "CAMP" && t.resource !== "WOOD" && t.resource !== "FUR") return { ok: false, reason: "camp requires SUPPLY tile" };
    if (structureType === "MINE" && t.resource !== "IRON" && t.resource !== "GEMS") return { ok: false, reason: "mine requires IRON or CRYSTAL tile" };
    const tileTown = townsByTile.get(tk);
    if (tileTown && townPopulationTier(tileTown.population) === "SETTLEMENT") return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
    if (isSupportOnlyStructureType(structureType)) {
      if (townsByTile.has(tk)) {
        const supportTileKey = pickRandomAvailableSupportTileForTown(tk, actor.id, structureType);
        if (!supportTileKey) return { ok: false, reason: `${structureType.toLowerCase()} needs an open support tile next to this town` };
      } else {
        if (supportedTowns.length === 0) return { ok: false, reason: `${structureType.toLowerCase()} requires a support tile next to your town` };
        if (supportedTowns.length > 1) return { ok: false, reason: "support tile touches multiple towns" };
        const supportedTownKey = supportedTowns[0];
        if (supportedTownKey && structureForSupportedTown(supportedTownKey, actor.id, structureType)) return { ok: false, reason: `town already has ${structureType.toLowerCase()}` };
      }
    }
    return { ok: true };
  };

  const tryBuildEconomicStructure = (actor: Player, x: number, y: number, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
    const clickedTile = playerTile(x, y);
    const placed = canPlaceEconomicStructure(actor, clickedTile, structureType);
    if (!placed.ok) return placed;
    let t = clickedTile;
    if (isSupportOnlyStructureType(structureType) && townsByTile.has(key(clickedTile.x, clickedTile.y))) {
      const supportTileKey = pickRandomAvailableSupportTileForTown(key(clickedTile.x, clickedTile.y), actor.id, structureType);
      if (!supportTileKey) return { ok: false, reason: `${structureType.toLowerCase()} needs an open support tile next to this town` };
      const [sx, sy] = parseKey(supportTileKey);
      t = playerTile(sx, sy);
    }
    const tk = key(t.x, t.y);
    const techChecks: Record<EconomicStructureType, [string, string]> = {
      FARMSTEAD: ["agriculture", "unlock farmsteads via Agriculture first"],
      CAMP: ["leatherworking", "unlock camps via Leatherworking first"],
      MINE: ["mining", "unlock mines via Mining first"],
      MARKET: ["trade", "unlock markets via Trade first"],
      GRANARY: ["", "unlock granaries via Pottery first"],
      BANK: ["coinage", "unlock banks via Coinage first"],
      AIRPORT: ["aeronautics", "unlock airports via Aeronautics first"],
      WOODEN_FORT: ["", ""],
      LIGHT_OUTPOST: ["", ""],
      FUR_SYNTHESIZER: ["workshops", "unlock fur synthesizers via Workshops first"],
      ADVANCED_FUR_SYNTHESIZER: ["", ""],
      IRONWORKS: ["alchemy", "unlock ironworks via Alchemy first"],
      ADVANCED_IRONWORKS: ["", ""],
      CRYSTAL_SYNTHESIZER: ["crystal-lattices", "unlock crystal synthesizers via Crystal Lattices first"],
      ADVANCED_CRYSTAL_SYNTHESIZER: ["", ""],
      FUEL_PLANT: ["plastics", "unlock fuel plants via Plastics first"],
      CARAVANARY: ["", ""],
      FOUNDRY: ["industrial-extraction", "unlock foundries via Industrial Extraction first"],
      CUSTOMS_HOUSE: ["", ""],
      GARRISON_HALL: ["", ""],
      GOVERNORS_OFFICE: ["civil-service", "unlock governor's offices via Civil Service first"],
      RADAR_SYSTEM: ["radar", "unlock radar systems via Radar first"]
    };
    const [requiredTech, reason] = techChecks[structureType] ?? ["", ""];
    if (structureType === "GRANARY" && !getPlayerEffectsForPlayer(actor.id).unlockGranary) return { ok: false, reason };
    if ((structureType === "ADVANCED_FUR_SYNTHESIZER" || structureType === "ADVANCED_IRONWORKS" || structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") && !getPlayerEffectsForPlayer(actor.id).unlockAdvancedSynthesizers) {
      return { ok: false, reason: "unlock advanced synthesizers via Advanced Synthetication first" };
    }
    if (requiredTech && !actor.techIds.has(requiredTech)) return { ok: false, reason };
    if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
    const goldCost = deps.structureBuildGoldCost(structureType, ownedStructureCountForPlayer(actor.id, structureType));
    const chargeGold = (): boolean => {
      if (actor.points < goldCost) return false;
      actor.points -= goldCost;
      return true;
    };
    const fail = (message: string) => ({ ok: false as const, reason: message });
    if (structureType === "FARMSTEAD") {
      if (!chargeGold()) return fail("insufficient gold for farmstead");
      if (!consumeStrategicResource(actor, "FOOD", deps.FARMSTEAD_BUILD_FOOD_COST)) return fail("insufficient FOOD for farmstead");
    } else if (structureType === "CAMP") {
      if (!chargeGold()) return fail("insufficient gold for camp");
      if (!consumeStrategicResource(actor, "SUPPLY", deps.CAMP_BUILD_SUPPLY_COST)) return fail("insufficient SUPPLY for camp");
    } else if (structureType === "MINE") {
      if (!chargeGold()) return fail("insufficient gold for mine");
      const matching = t.resource === "IRON" ? "IRON" : "CRYSTAL";
      if (!consumeStrategicResource(actor, matching, deps.MINE_BUILD_RESOURCE_COST)) return fail(`insufficient ${matching} for mine`);
    } else {
      const structuredCosts: Partial<Record<EconomicStructureType, { crystal?: number; food?: number }>> = {
        MARKET: { crystal: deps.MARKET_BUILD_CRYSTAL_COST },
        GRANARY: { food: deps.GRANARY_BUILD_FOOD_COST },
        BANK: { crystal: deps.BANK_BUILD_CRYSTAL_COST },
        CARAVANARY: { crystal: deps.CARAVANARY_BUILD_CRYSTAL_COST },
        GARRISON_HALL: { crystal: deps.GARRISON_HALL_BUILD_CRYSTAL_COST },
        CUSTOMS_HOUSE: { crystal: deps.CUSTOMS_HOUSE_BUILD_CRYSTAL_COST },
        RADAR_SYSTEM: { crystal: deps.RADAR_SYSTEM_BUILD_CRYSTAL_COST },
        AIRPORT: { crystal: deps.AIRPORT_BUILD_CRYSTAL_COST }
      };
      if (!chargeGold()) return fail(`insufficient gold for ${prettyEconomicStructureLabel(structureType).toLowerCase()}`);
      const cost = structuredCosts[structureType];
      if (cost?.crystal && !consumeStrategicResource(actor, "CRYSTAL", cost.crystal)) return fail(`insufficient CRYSTAL for ${prettyEconomicStructureLabel(structureType).toLowerCase()}`);
      if (cost?.food && !consumeStrategicResource(actor, "FOOD", cost.food)) return fail(`insufficient FOOD for ${prettyEconomicStructureLabel(structureType).toLowerCase()}`);
      if (structureType === "ADVANCED_FUR_SYNTHESIZER" && !consumeStrategicResource(actor, "SUPPLY", 40)) return fail("insufficient SUPPLY for advanced fur synthesizer");
      if (structureType === "ADVANCED_IRONWORKS" && !consumeStrategicResource(actor, "IRON", 40)) return fail("insufficient IRON for advanced ironworks");
      if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" && !consumeStrategicResource(actor, "CRYSTAL", 40)) return fail("insufficient CRYSTAL for advanced crystal synthesizer");
    }
    recalcPlayerDerived(actor);
    const buildMs = economicStructureBuildDurationMs(structureType);
    const completesAt = now() + buildMs;
    if (baseSynthTypeForAdvanced(structureType)) untrackOwnedTileKey(economicStructureTileKeysByPlayer, actor.id, tk);
    economicStructuresByTile.set(tk, { id: deps.randomUUID(), type: structureType, tileKey: tk, ownerId: actor.id, status: "under_construction", completesAt, nextUpkeepAt: completesAt + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS });
    markSummaryChunkDirtyAtTile(t.x, t.y);
    trackOwnedTileKey(economicStructureTileKeysByPlayer, actor.id, tk);
    recordTileStructureHistory(tk, structureType);
    const timer = setTimeout(() => {
      const current = economicStructuresByTile.get(tk);
      if (!current) return;
      const tileNow = runtimeTileCore(t.x, t.y);
      const ownsActiveSite = current.type === "FOUNDRY" ? tileNow.ownerId === actor.id && tileNow.terrain === "LAND" : isLightCombatStructureType(current.type) ? tileNow.ownerId === actor.id && tileNow.terrain === "LAND" : tileNow.ownerId === actor.id && tileNow.ownershipState === "SETTLED";
      if (!ownsActiveSite) {
        cancelEconomicStructureBuild(tk);
        return;
      }
      current.status = "active";
      delete current.inactiveReason;
      delete current.completesAt;
      economicStructureBuildTimers.delete(tk);
      markSummaryChunkDirtyAtTile(t.x, t.y);
      if (current.type === "AIRPORT") discoverOilFieldNearAirport(actor.id, tk);
      updateOwnership(t.x, t.y, actor.id);
    }, buildMs);
    economicStructureBuildTimers.set(tk, timer);
    return { ok: true };
  };

  const syncEconomicStructuresForPlayer = (player: Player): Set<TileKey> => {
    const touched = new Set<TileKey>();
    const stock = getOrInitStrategicStocks(player.id);
    for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (!structure) continue;
      if (structure.status === "under_construction" || structure.status === "removing") continue;
      if (structure.disabledUntil && structure.disabledUntil > now()) {
        structure.status = "inactive";
        touched.add(tk);
        continue;
      }
      if (structure.disabledUntil && structure.disabledUntil <= now()) delete structure.disabledUntil;
      const [x, y] = parseKey(tk);
      const tile = playerTile(x, y);
      const canRemainActive = structure.type === "FOUNDRY" ? tile.ownerId === player.id && tile.terrain === "LAND" : isLightCombatStructureType(structure.type) ? tile.ownerId === player.id && tile.terrain === "LAND" : tile.ownerId === player.id && tile.ownershipState === "SETTLED";
      if (!canRemainActive) {
        structure.status = "inactive";
        touched.add(tk);
        continue;
      }
      if (isConverterStructureType(structure.type) && structure.status === "inactive" && structure.inactiveReason) {
        touched.add(tk);
        continue;
      }
      if (!economicStructureUpkeepDue(structure)) continue;
      if (structure.type === "MARKET" || structure.type === "BANK") {
        const crystalUpkeep = (structure.type === "MARKET" ? deps.MARKET_CRYSTAL_UPKEEP : deps.BANK_CRYSTAL_UPKEEP) * getPlayerEffectsForPlayer(player.id).marketCrystalUpkeepMult;
        if ((stock.CRYSTAL ?? 0) >= crystalUpkeep) {
          stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - crystalUpkeep);
          structure.status = "active";
        } else {
          structure.status = "inactive";
        }
      } else {
        const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
        if (player.points >= upkeep) {
          player.points = Math.max(0, player.points - upkeep);
          if (structure.type !== "AIRPORT") {
            structure.status = "active";
            delete structure.inactiveReason;
          }
        } else if (structure.type !== "AIRPORT") {
          structure.status = "inactive";
          if (isConverterStructureType(structure.type)) structure.inactiveReason = "upkeep";
        }
      }
      structure.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
      touched.add(tk);
    }
    return touched;
  };

  const applyUpkeepForPlayer = (player: Player): { touchedTileKeys: Set<TileKey> } => {
    const stock = getOrInitStrategicStocks(player.id);
    syncObservatoriesForPlayer(player.id, true);
    const upkeep = upkeepPerMinuteForPlayer(player);
    const touchedTileKeys = new Set<TileKey>();
    const diag = emptyUpkeepDiagnostics();
    const availableFoodBeforeUpkeep = Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD");
    const foodFeedingState = computeTownFeedingState(player.id, availableFoodBeforeUpkeep);
    const payResource = (resource: StrategicResource, needRaw: number) => {
      const need = Math.max(0, needRaw);
      const fromYield = consumeYieldStrategicForPlayer(player, resource, need, touchedTileKeys);
      const afterYield = Math.max(0, need - fromYield);
      const have = Math.max(0, stock[resource] ?? 0);
      const fromStock = Math.min(afterYield, have);
      stock[resource] = Math.max(0, have - fromStock);
      const remaining = Math.max(0, need - fromYield - fromStock);
      return { need, fromYield, fromStock, remaining, contributors: [] };
    };
    diag.food = payResource("FOOD", upkeep.food);
    diag.iron = payResource("IRON", upkeep.iron);
    diag.supply = payResource("SUPPLY", upkeep.supply);
    diag.crystal = payResource("CRYSTAL", upkeep.crystal);
    diag.oil = payResource("OIL", upkeep.oil);
    const contributors = upkeepContributorsForPlayer(player);
    diag.food.contributors = contributors.food;
    diag.iron.contributors = contributors.iron;
    diag.supply.contributors = contributors.supply;
    diag.crystal.contributors = contributors.crystal;
    diag.oil.contributors = contributors.oil;
    diag.foodCoverage = foodFeedingState.foodCoverage;
    foodUpkeepCoverageByPlayer.set(player.id, diag.foodCoverage);
    townFeedingStateByPlayer.set(player.id, foodFeedingState);
    if (diag.crystal.need > 0 && diag.crystal.remaining > 0) {
      const activeReveals = revealedEmpireTargetsByPlayer.get(player.id);
      if (activeReveals && activeReveals.size > 0) {
        activeReveals.clear();
        sendToPlayer(player.id, { type: "REVEAL_EMPIRE_UPDATE", activeTargets: [] });
      }
      syncObservatoriesForPlayer(player.id, false);
      for (const [tk, observatory] of observatoriesByTile) if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    } else {
      syncObservatoriesForPlayer(player.id, true);
      for (const [tk, observatory] of observatoriesByTile) if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    }
    for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.type !== "AIRPORT" || structure.status === "under_construction") continue;
      const nextStatus = diag.oil.need > 0 && diag.oil.remaining > 0 ? "inactive" : "active";
      if (structure.status !== nextStatus) {
        structure.status = nextStatus;
        touchedTileKeys.add(tk);
      }
    }
    const goldNeed = Math.max(0, upkeep.gold);
    const goldFromYield = consumeYieldGoldForPlayer(player, goldNeed, touchedTileKeys);
    const goldAfterYield = Math.max(0, goldNeed - goldFromYield);
    const goldFromWallet = Math.min(goldAfterYield, Math.max(0, player.points));
    player.points = Math.max(0, player.points - goldFromWallet);
    diag.gold = { need: goldNeed, fromYield: goldFromYield, fromStock: goldFromWallet, remaining: Math.max(0, goldNeed - goldFromYield - goldFromWallet), contributors: contributors.gold };
    deps.lastUpkeepByPlayer.set(player.id, diag);
    return { touchedTileKeys };
  };

  const addTileYield = (tileKey: TileKey, goldDelta: number, strategicDelta?: Partial<Record<StrategicResource, number>>): void => {
    const y = getOrInitTileYield(tileKey);
    const ownerId = ownership.get(tileKey);
    const caps = tileYieldCapsFor(tileKey, ownerId);
    if (goldDelta > 0) y.gold = Math.min(caps.gold, y.gold + goldDelta);
    if (strategicDelta) {
      for (const [r, v] of Object.entries(strategicDelta) as Array<[StrategicResource, number]>) {
        if (v <= 0) continue;
        y.strategic[r] = Math.min(caps.strategicEach, (y.strategic[r] ?? 0) + v);
      }
    }
  };

  const accumulatePassiveIncomeForPlayer = (player: Player): void => {
    const economyIndex = deps.getOrInitEconomyIndex(player.id);
    for (const tk of economyIndex.settledResourceTileKeys) {
      const [x, y] = parseKey(tk);
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      const siphon = activeSiphonAt(tk);
      const ownerMult = siphon ? 1 - SIPHON_SHARE : 1;
      const goldBase = (resourceRate[resource] ?? 0) * player.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      const goldDelta = goldBase * ownerMult;
      const strategic: Partial<Record<StrategicResource, number>> = {};
      const sr = toStrategicResource(resource) as StrategicResource | undefined;
      if (sr) strategic[sr] = (strategicDailyFromResource[resource] ?? 0) * activeResourceIncomeMult(player.id, resource) * deps.HARVEST_RESOURCE_RATE_MULT * ownerMult;
      if (siphon) {
        const siphonedStrategic: Partial<Record<StrategicResource, number>> = {};
        if (sr) siphonedStrategic[sr] = (strategicDailyFromResource[resource] ?? 0) * activeResourceIncomeMult(player.id, resource) * deps.HARVEST_RESOURCE_RATE_MULT * SIPHON_SHARE;
        addToSiphonCache(siphon.casterPlayerId, tk, goldBase * SIPHON_SHARE, siphonedStrategic, siphon.endsAt);
      }
      if (goldDelta > 0 || hasPositiveStrategicBuffer(strategic)) addTileYield(tk, goldDelta, strategic);
    }
    for (const tk of economyIndex.settledDockTileKeys) {
      const dock = docksByTile.get(tk);
      if (!dock) continue;
      const goldDelta = dockIncomeForOwner(dock, player.id) * player.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      if (goldDelta > 0) addTileYield(tk, goldDelta);
    }
    for (const tk of economyIndex.settledTownTileKeys) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      const siphon = activeSiphonAt(tk);
      const ownerMult = siphon ? 1 - SIPHON_SHARE : 1;
      const townGoldBase = townIncomeForOwner(town, player.id) * player.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      const goldDelta = townGoldBase * ownerMult;
      if (siphon) addToSiphonCache(siphon.casterPlayerId, tk, townGoldBase * SIPHON_SHARE, {}, siphon.endsAt);
      if (goldDelta > 0) addTileYield(tk, goldDelta);
    }
    for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.ownerId !== player.id || structure.status !== "active") continue;
      const strategicDaily = converterStructureOutputFor(structure.type, structure.ownerId);
      if (!strategicDaily) continue;
      const strategic: Partial<Record<StrategicResource, number>> = {};
      for (const [resource, amount] of Object.entries(strategicDaily) as Array<[StrategicResource, number]>) strategic[resource] = amount * HARVEST_RESOURCE_RATE_MULT;
      if (hasPositiveStrategicBuffer(strategic)) addTileYield(tk, 0, strategic);
    }
  };

  return {
    currentFoodCoverageForPlayer,
    playerHasSettledFoodSources,
    economicStructureBuildDurationMs,
    structureBuildDurationMsForRuntime,
    baseSynthTypeForAdvanced,
    canPlaceEconomicStructure,
    tryBuildEconomicStructure,
    syncEconomicStructuresForPlayer,
    applyUpkeepForPlayer,
    accumulatePassiveIncomeForPlayer,
    addTileYield,
    playerEconomySnapshot,
    activeAirportAt,
    hostileRadarProtectingTile
  };
};
