import type { EconomicStructure, EconomicStructureType, TileKey } from "@border-empires/shared";

import type { TownDefinition } from "./server-shared-types.js";
import type { ServerSettlementFlowDeps, ServerSettlementFlowRuntime } from "./server-composition-types.js";

export const createServerSettlementFlow = (deps: ServerSettlementFlowDeps): ServerSettlementFlowRuntime => {
  const {
    key,
    now,
    parseKey,
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    POPULATION_MIN,
    POPULATION_MAX,
    POPULATION_START_SPREAD,
    resourceRate,
    players,
    townsByTile,
    docksByTile,
    fortsByTile,
    observatoriesByTile,
    siegeOutpostsByTile,
    economicStructuresByTile,
    ownership,
    ownershipStateByTile,
    settledSinceByTile,
    activeSeason,
    seeded01,
    terrainAtRuntime,
    playerTile,
    applyClusterResources,
    resourceAt,
    townTypeAt,
    townPopulationTierForTown,
    assignMissingTownNamesForWorld,
    markSummaryChunkDirtyAtTile,
    sendVisibleTileDeltaAt,
    dockIncomeForOwner,
    townPotentialIncomeForOwner
  } = deps;

  const supportedTownKeysForTile = (tileKey: TileKey, ownerId: string | undefined): TileKey[] => {
    if (!ownerId) return [];
    const [x, y] = parseKey(tileKey);
    const out: TileKey[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const town = townsByTile.get(nk);
        if (!town || townPopulationTierForTown(town) === "SETTLEMENT") continue;
        if (ownership.get(nk) !== ownerId) continue;
        if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
        out.push(nk);
      }
    }
    return out;
  };

  const structureForSupportedTown = (townKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): EconomicStructure | undefined => {
    if (!ownerId) return undefined;
    const [x, y] = parseKey(townKey);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const structure = economicStructuresByTile.get(nk);
        if (structure && structure.type === type && structure.ownerId === ownerId) return structure;
      }
    }
    return undefined;
  };

  const supportedDockKeysForTile = (tileKey: TileKey, ownerId: string | undefined): TileKey[] => {
    if (!ownerId) return [];
    const [x, y] = parseKey(tileKey);
    const out: TileKey[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        if (!docksByTile.has(nk)) continue;
        if (ownership.get(nk) !== ownerId) continue;
        if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
        out.push(nk);
      }
    }
    return out;
  };

  const structureForSupportedDock = (dockKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): EconomicStructure | undefined => {
    if (!ownerId) return undefined;
    const [x, y] = parseKey(dockKey);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const structure = economicStructuresByTile.get(nk);
        if (structure && structure.type === type && structure.ownerId === ownerId) return structure;
      }
    }
    return undefined;
  };

  const isSupportOnlyStructureType = (structureType: EconomicStructureType): boolean =>
    deps.structurePlacementMetadata(structureType).placementMode === "town_support";

  const isDockSupportOnlyStructureType = (structureType: EconomicStructureType): boolean =>
    deps.structurePlacementMetadata(structureType).placementMode === "dock_support";

  const isLightCombatStructureType = (structureType: EconomicStructureType): boolean =>
    structureType === "WOODEN_FORT" || structureType === "LIGHT_OUTPOST";

  const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
    structureType === "FUR_SYNTHESIZER" ||
    structureType === "ADVANCED_FUR_SYNTHESIZER" ||
    structureType === "IRONWORKS" ||
    structureType === "ADVANCED_IRONWORKS" ||
    structureType === "CRYSTAL_SYNTHESIZER" ||
    structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
    structureType === "FUEL_PLANT";

  const availableSupportTileKeysForTown = (townKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType): TileKey[] => {
    if (!ownerId || !isSupportOnlyStructureType(structureType)) return [];
    if (structureForSupportedTown(townKey, ownerId, structureType)) return [];
    const [x, y] = parseKey(townKey);
    const out: TileKey[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const tile = playerTile(...parseKey(nk));
        if (tile.terrain !== "LAND") continue;
        if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
        if (tile.resource || townsByTile.has(nk) || docksByTile.has(nk)) continue;
        if (fortsByTile.has(nk) || siegeOutpostsByTile.has(nk) || observatoriesByTile.has(nk) || economicStructuresByTile.has(nk)) continue;
        const supportedTowns = supportedTownKeysForTile(nk, ownerId);
        if (supportedTowns.length !== 1 || supportedTowns[0] !== townKey) continue;
        out.push(nk);
      }
    }
    return out;
  };

  const availableSupportTileKeysForDock = (dockKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType): TileKey[] => {
    if (!ownerId || !isDockSupportOnlyStructureType(structureType)) return [];
    if (structureForSupportedDock(dockKey, ownerId, structureType)) return [];
    const [x, y] = parseKey(dockKey);
    const out: TileKey[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const tile = playerTile(...parseKey(nk));
        if (tile.terrain !== "LAND") continue;
        if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
        if (tile.resource || townsByTile.has(nk) || docksByTile.has(nk)) continue;
        if (fortsByTile.has(nk) || siegeOutpostsByTile.has(nk) || observatoriesByTile.has(nk) || economicStructuresByTile.has(nk)) continue;
        const supportedDocks = supportedDockKeysForTile(nk, ownerId);
        if (supportedDocks.length !== 1 || supportedDocks[0] !== dockKey) continue;
        out.push(nk);
      }
    }
    return out;
  };

  const pickRandomAvailableSupportTileForTown = (townKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType): TileKey | undefined => {
    const candidates = availableSupportTileKeysForTown(townKey, ownerId, structureType);
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : undefined;
  };

  const pickRandomAvailableSupportTileForDock = (dockKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType): TileKey | undefined => {
    const candidates = availableSupportTileKeysForDock(dockKey, ownerId, structureType);
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : undefined;
  };

  const ownedTownKeysForPlayer = (playerId: string): TileKey[] =>
    [...townsByTile.values()]
      .filter((town) => ownership.get(town.tileKey) === playerId && ownershipStateByTile.get(town.tileKey) === "SETTLED")
      .sort((a, b) => a.townId.localeCompare(b.townId))
      .map((town) => town.tileKey);

  const initialSettlementPopulationAt = (x: number, y: number): number =>
    POPULATION_MIN + Math.floor(seeded01(x, y, activeSeason.worldSeed + 9601) * POPULATION_START_SPREAD);

  const isRelocatableSettlementTown = (town: TownDefinition | undefined): town is TownDefinition =>
    Boolean(town && town.isSettlement && townPopulationTierForTown(town) === "SETTLEMENT");

  const activeSettlementTileKeyForPlayer = (playerId: string): TileKey | undefined =>
    ownedTownKeysForPlayer(playerId).find((tk) => isRelocatableSettlementTown(townsByTile.get(tk)));

  const oldestSettledSettlementCandidateForPlayer = (playerId: string): TileKey | undefined => {
    const player = players.get(playerId);
    if (!player) return undefined;
    return [...player.territoryTiles]
      .filter((tk) => {
        if (ownership.get(tk) !== playerId || ownershipStateByTile.get(tk) !== "SETTLED") return false;
        const [x, y] = parseKey(tk);
        if (terrainAtRuntime(x, y) !== "LAND" || townsByTile.has(tk) || docksByTile.has(tk)) return false;
        if (applyClusterResources(x, y, resourceAt(x, y))) return false;
        return !fortsByTile.has(tk) && !observatoriesByTile.has(tk) && !siegeOutpostsByTile.has(tk) && !economicStructuresByTile.has(tk);
      })
      .sort((left, right) => {
        const leftAge = settledSinceByTile.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightAge = settledSinceByTile.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftAge !== rightAge ? leftAge - rightAge : left.localeCompare(right);
      })[0];
  };

  const createSettlementAtTile = (ownerId: string, tileKey: TileKey, previousTown?: Pick<TownDefinition, "townId" | "type" | "name">): TownDefinition | undefined => {
    const [x, y] = parseKey(tileKey);
    if (ownership.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED" || terrainAtRuntime(x, y) !== "LAND") return undefined;
    if (townsByTile.has(tileKey) || docksByTile.has(tileKey) || fortsByTile.has(tileKey) || observatoriesByTile.has(tileKey) || siegeOutpostsByTile.has(tileKey) || economicStructuresByTile.has(tileKey)) return undefined;
    if (applyClusterResources(x, y, resourceAt(x, y))) return undefined;
    const town: TownDefinition = {
      townId: previousTown?.townId ?? `town-${townsByTile.size}`,
      tileKey,
      ...(previousTown?.name ? { name: previousTown.name } : {}),
      type: previousTown?.type ?? townTypeAt(x, y),
      population: initialSettlementPopulationAt(x, y),
      maxPopulation: POPULATION_MAX,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: now(),
      isSettlement: true
    };
    townsByTile.set(tileKey, town);
    assignMissingTownNamesForWorld();
    markSummaryChunkDirtyAtTile(x, y);
    sendVisibleTileDeltaAt(x, y);
    return town;
  };

  const canHostSettlementAtTile = (playerId: string, tileKey: TileKey | undefined): tileKey is TileKey => {
    if (!tileKey) return false;
    const [x, y] = parseKey(tileKey);
    if (ownership.get(tileKey) !== playerId || ownershipStateByTile.get(tileKey) !== "SETTLED" || terrainAtRuntime(x, y) !== "LAND") return false;
    if (townsByTile.has(tileKey) || docksByTile.has(tileKey) || fortsByTile.has(tileKey) || observatoriesByTile.has(tileKey) || siegeOutpostsByTile.has(tileKey) || economicStructuresByTile.has(tileKey)) return false;
    return !applyClusterResources(x, y, resourceAt(x, y));
  };

  const settledLandKeysForPlayer = (playerId: string): Set<TileKey> => {
    const settledLand = new Set<TileKey>();
    for (const tk of players.get(playerId)?.territoryTiles ?? []) {
      if (ownershipStateByTile.get(tk) === "SETTLED" && terrainAtRuntime(...parseKey(tk)) === "LAND") settledLand.add(tk);
    }
    return settledLand;
  };

  const directlyConnectedTownKeysForTown = (playerId: string, originTownKey: TileKey, settledLand = settledLandKeysForPlayer(playerId)): TileKey[] => {
    if (!settledLand.has(originTownKey)) return [];
    const ownedTownKeySet = new Set(ownedTownKeysForPlayer(playerId));
    const queue = [originTownKey];
    const visited = new Set<TileKey>([originTownKey]);
    const connectedTowns = new Set<TileKey>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      const [cx, cy] = parseKey(current);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextKey = key(wrapX(cx + dx, WORLD_WIDTH), wrapY(cy + dy, WORLD_HEIGHT));
          if (!settledLand.has(nextKey) || visited.has(nextKey)) continue;
          if (ownedTownKeySet.has(nextKey) && nextKey !== originTownKey) {
            connectedTowns.add(nextKey);
            visited.add(nextKey);
            continue;
          }
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
    }
    return [...connectedTowns];
  };

  const recomputeTownNetworkForPlayer = (playerId: string): void => {
    const settledLand = settledLandKeysForPlayer(playerId);
    for (const townKey of ownedTownKeysForPlayer(playerId)) {
      const town = townsByTile.get(townKey);
      if (!town) continue;
      const connectedTownCount = directlyConnectedTownKeysForTown(playerId, townKey, settledLand).length;
      town.connectedTownCount = connectedTownCount;
      town.connectedTownBonus = deps.connectedTownBonusForOwner(connectedTownCount, playerId);
    }
  };

  const playerHasOtherGoldIncome = (playerId: string): boolean => {
    const player = players.get(playerId);
    if (!player) return false;
    for (const tk of player.territoryTiles) {
      if (ownership.get(tk) !== playerId || ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const [x, y] = parseKey(tk);
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const resource = resourceAt(x, y);
      const dock = docksByTile.get(tk);
      const town = townsByTile.get(tk);
      if (resource && (resourceRate[resource] ?? 0) > 0) return true;
      if (dock && dockIncomeForOwner(dock, playerId) > 0) return true;
      if (town && townPopulationTierForTown(town) !== "SETTLEMENT" && townPotentialIncomeForOwner(town, playerId, { ignoreSuppression: true, ignoreManpowerGate: true }) > 0) return true;
    }
    return false;
  };

  const ensureActiveSettlementForPlayer = (playerId: string): boolean => {
    if (activeSettlementTileKeyForPlayer(playerId)) return false;
    const player = players.get(playerId);
    if (!player) return false;
    for (const candidate of [player.spawnOrigin, player.capitalTileKey, oldestSettledSettlementCandidateForPlayer(playerId)]) {
      if (!canHostSettlementAtTile(playerId, candidate)) continue;
      if (createSettlementAtTile(playerId, candidate)) {
        recomputeTownNetworkForPlayer(playerId);
        return true;
      }
    }
    return false;
  };

  const ensureFallbackSettlementForPlayer = (playerId: string): boolean => {
    if (activeSettlementTileKeyForPlayer(playerId) || playerHasOtherGoldIncome(playerId)) return false;
    const candidate = oldestSettledSettlementCandidateForPlayer(playerId);
    if (!candidate || !createSettlementAtTile(playerId, candidate)) return false;
    recomputeTownNetworkForPlayer(playerId);
    return true;
  };

  const relocateCapturedSettlementForPlayer = (
    playerId: string,
    displacedTown: Pick<TownDefinition, "townId" | "type"> & { name?: string }
  ): boolean => {
    const candidate = oldestSettledSettlementCandidateForPlayer(playerId);
    if (!candidate || !createSettlementAtTile(playerId, candidate, displacedTown)) return false;
    recomputeTownNetworkForPlayer(playerId);
    return true;
  };

  const firstThreeTownKeySetForPlayer = (playerId: string): Set<TileKey> => new Set(ownedTownKeysForPlayer(playerId).slice(0, 3));

  return {
    supportedTownKeysForTile,
    structureForSupportedTown,
    supportedDockKeysForTile,
    structureForSupportedDock,
    isSupportOnlyStructureType,
    isDockSupportOnlyStructureType,
    isLightCombatStructureType,
    isConverterStructureType,
    availableSupportTileKeysForTown,
    availableSupportTileKeysForDock,
    pickRandomAvailableSupportTileForTown,
    pickRandomAvailableSupportTileForDock,
    ownedTownKeysForPlayer,
    isRelocatableSettlementTown,
    activeSettlementTileKeyForPlayer,
    oldestSettledSettlementCandidateForPlayer,
    createSettlementAtTile,
    ensureActiveSettlementForPlayer,
    ensureFallbackSettlementForPlayer,
    relocateCapturedSettlementForPlayer,
    firstThreeTownKeySetForPlayer,
    directlyConnectedTownKeysForTown,
    recomputeTownNetworkForPlayer
  };
};
