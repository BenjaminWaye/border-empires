import {
  type Dock,
  type LandBiome,
  type Player,
  type Tile,
  type TileKey
} from "@border-empires/shared";
import { SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE } from "./server-game-constants.js";
import type { RuntimeTileCore } from "./server-shared-types.js";
import type {
  AiEconomyPriorityState,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierSignalsDeps {
  BARBARIAN_OWNER_ID: string;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, string>;
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, Dock>;
  currentIncomePerMinute: (actor: Player) => number;
  currentFoodCoverageForPlayer: (playerId: string) => number;
  ownedTownKeysForPlayer: (playerId: string) => TileKey[];
  playerWorldFlags: (actor: Player) => Set<string>;
  countControlledTowns: (playerId: string) => number;
  islandMap: () => { islandIdByTile: Map<TileKey, number>; landCounts: Map<number, number> };
  dockLinkedTileKeys: (dock: Dock) => TileKey[];
  visibilitySnapshotForPlayer: (player: Player) => AiTerritorySummary["visibility"];
  visibleInSnapshot: (snapshot: AiTerritorySummary["visibility"], x: number, y: number) => boolean;
  supportedTownKeysForTile: (tileKey: TileKey, actorId: string) => TileKey[];
  aiTileLiteAt: (x: number, y: number) => Tile;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  landBiomeAt: (x: number, y: number) => LandBiome | undefined;
  grassShadeAt: (x: number, y: number) => "LIGHT" | "DARK" | undefined;
  isNearMountain: (x: number, y: number, distance: number) => boolean;
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  baseTileValue: (resource: Tile["resource"]) => number;
}

export interface ServerAiFrontierSignalsRuntime {
  aiEconomyPriorityState: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ) => AiEconomyPriorityState;
  aiFoodPressureSignal: (actor: Player) => number;
  cachedAiIslandProgress: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "islandProgress">
  ) => NonNullable<AiTerritorySummary["islandProgress"]>;
  aiIslandFootprintSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
  ) => number;
  bestAiIslandFocusTargetId: (
    actor: Player,
    territorySummary: Pick<
      AiTerritorySummary,
      "expandCandidates" | "activeExpandCandidates" | "frontierTiles" | "strategicFrontierTiles" | "islandProgress" | "islandFocusTargetId"
    >
  ) => number | undefined;
  aiDockStrategicSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Partial<Pick<AiTerritorySummary, "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  aiFrontierActionCandidates: (actor: Player, from: Tile, actionType: "EXPAND" | "ATTACK") => Tile[];
  aiEconomicFrontierSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    foodPressure?: number,
    territorySummary?: Partial<Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  aiEnemyPressureSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    territorySummary?: Partial<Pick<AiTerritorySummary, "pressureSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  isOwnedTownSupportRingTile: (ownerId: string, tile: Tile) => boolean;
  cachedSupportedTownKeysForTile: (
    actorId: string,
    tileKey: TileKey,
    territorySummary?: Pick<AiTerritorySummary, "supportedTownKeysByTileKey">
  ) => TileKey[];
  pressureAttackThreatensCore: (actor: Player, candidate?: { to: Tile }) => boolean;
  fortTileProtectsCore: (actor: Player, tile?: Tile) => boolean;
  fortTileIsDockChokePoint: (tile?: Tile) => boolean;
}

export const createServerAiFrontierSignalsRuntime = (
  deps: CreateServerAiFrontierSignalsDeps
): ServerAiFrontierSignalsRuntime => {
  const aiEconomyPriorityState = (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ): AiEconomyPriorityState => {
    const controlledTowns = territorySummary?.controlledTowns ?? deps.countControlledTowns(actor.id);
    const settledTiles =
      territorySummary?.settledTileCount ?? [...actor.territoryTiles].filter((tileKey) => deps.ownershipStateByTile.get(tileKey) === "SETTLED").length;
    const aiIncome = deps.currentIncomePerMinute(actor);
    const worldFlags = territorySummary?.worldFlags ?? deps.playerWorldFlags(actor);
    const foodCoverageLow = controlledTowns > 0 && deps.currentFoodCoverageForPlayer(actor.id) < 1;
    const economyWeak =
      aiIncome < (controlledTowns === 0 ? 12 : 18) ||
      (!worldFlags.has("active_town") && !worldFlags.has("active_dock") && settledTiles >= 6) ||
      foodCoverageLow;
    return { controlledTowns, settledTiles, aiIncome, worldFlags, foodCoverageLow, economyWeak };
  };

  const aiFoodPressureSignal = (actor: Player): number => {
    const ownedTownCount = deps.ownedTownKeysForPlayer(actor.id).length;
    if (ownedTownCount <= 0) return 0;
    const coverage = deps.currentFoodCoverageForPlayer(actor.id);
    if (coverage >= 1.2) return 0;
    if (coverage >= 1) return 35;
    if (coverage >= 0.85) return 80;
    return 140;
  };

  const cachedAiIslandProgress = (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "islandProgress">
  ): NonNullable<AiTerritorySummary["islandProgress"]> => {
    if (territorySummary?.islandProgress) return territorySummary.islandProgress;
    const { islandIdByTile, landCounts } = deps.islandMap();
    const settledCounts = new Map<number, number>();
    const ownedCounts = new Map<number, number>();
    for (const tk of actor.territoryTiles) {
      const islandId = islandIdByTile.get(tk);
      if (islandId === undefined) continue;
      ownedCounts.set(islandId, (ownedCounts.get(islandId) ?? 0) + 1);
      if (deps.ownershipStateByTile.get(tk) !== "SETTLED") continue;
      settledCounts.set(islandId, (settledCounts.get(islandId) ?? 0) + 1);
    }
    let undercoveredIslandCount = 0;
    let ownedUndercoveredIslandCount = 0;
    let weakestRatio = Number.POSITIVE_INFINITY;
    for (const [islandId, totalLand] of landCounts) {
      if (totalLand <= 0) continue;
      const ratio = (settledCounts.get(islandId) ?? 0) / totalLand;
      if (ratio < SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
        undercoveredIslandCount += 1;
        if ((ownedCounts.get(islandId) ?? 0) > 0) ownedUndercoveredIslandCount += 1;
      }
      weakestRatio = Math.min(weakestRatio, ratio);
    }
    const progress = {
      settledCounts,
      ownedCounts,
      landCounts,
      totalIslands: landCounts.size,
      undercoveredIslandCount,
      ownedUndercoveredIslandCount,
      weakestRatio: Number.isFinite(weakestRatio) ? weakestRatio : 1
    };
    if (territorySummary) territorySummary.islandProgress = progress;
    return progress;
  };

  const aiIslandFootprintSignal = (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
  ): number => {
    const tk = deps.key(tile.x, tile.y);
    const cached = territorySummary?.islandFootprintSignalByTileKey.get(tk);
    if (cached !== undefined) return cached;
    const { islandIdByTile } = deps.islandMap();
    const islandId = islandIdByTile.get(tk);
    if (islandId === undefined) {
      territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
      return 0;
    }
    const progress = cachedAiIslandProgress(actor, territorySummary);
    const totalLand = progress.landCounts.get(islandId) ?? 0;
    if (totalLand <= 0) {
      territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
      return 0;
    }
    const settledRatio = (progress.settledCounts.get(islandId) ?? 0) / totalLand;
    if (settledRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
      territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
      return 0;
    }
    const ownedCount = progress.ownedCounts.get(islandId) ?? 0;
    const missingShare = SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE - settledRatio;
    let score = 130 + Math.round(missingShare * 1200);
    if (ownedCount === 0) score += 180;
    else if ((progress.settledCounts.get(islandId) ?? 0) === 0) score += 110;
    territorySummary?.islandFootprintSignalByTileKey.set(tk, score);
    return score;
  };

  const bestAiIslandFocusTargetId = (
    actor: Player,
    territorySummary: Pick<
      AiTerritorySummary,
      "expandCandidates" | "activeExpandCandidates" | "frontierTiles" | "strategicFrontierTiles" | "islandProgress" | "islandFocusTargetId"
    >
  ): number | undefined => {
    if (territorySummary.islandFocusTargetId !== undefined) return territorySummary.islandFocusTargetId;
    const progress = cachedAiIslandProgress(actor, territorySummary);
    const { islandIdByTile } = deps.islandMap();
    const candidateIslandIds = new Set<number>();
    const settlementFrontierTiles =
      territorySummary.strategicFrontierTiles.length > 0 ? territorySummary.strategicFrontierTiles : territorySummary.frontierTiles;
    for (const tile of settlementFrontierTiles) {
      const islandId = islandIdByTile.get(deps.key(tile.x, tile.y));
      if (islandId !== undefined) candidateIslandIds.add(islandId);
    }
    const frontierCandidates =
      territorySummary.activeExpandCandidates.length > 0 ? territorySummary.activeExpandCandidates : territorySummary.expandCandidates;
    for (const { to } of frontierCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const islandId = islandIdByTile.get(deps.key(to.x, to.y));
      if (islandId !== undefined) candidateIslandIds.add(islandId);
    }
    let bestOwnedIslandId: number | undefined;
    let bestOwnedScore = Number.NEGATIVE_INFINITY;
    let bestNewIslandId: number | undefined;
    let bestNewScore = Number.NEGATIVE_INFINITY;
    for (const islandId of candidateIslandIds) {
      const totalLand = progress.landCounts.get(islandId) ?? 0;
      if (totalLand <= 0) continue;
      const settledCount = progress.settledCounts.get(islandId) ?? 0;
      const ownedCount = progress.ownedCounts.get(islandId) ?? 0;
      const settledRatio = settledCount / totalLand;
      if (settledRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) continue;
      const missingShare = SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE - settledRatio;
      if (ownedCount > 0) {
        const score = 500 + settledRatio * 700 - missingShare * 220 + Math.min(ownedCount, 12) * 12;
        if (score > bestOwnedScore) {
          bestOwnedIslandId = islandId;
          bestOwnedScore = score;
        }
      } else {
        const score = 220 + missingShare * 260;
        if (score > bestNewScore) {
          bestNewIslandId = islandId;
          bestNewScore = score;
        }
      }
    }
    const focusedIslandId = bestOwnedIslandId ?? bestNewIslandId;
    territorySummary.islandFocusTargetId = focusedIslandId;
    return focusedIslandId;
  };

  const aiDockStrategicSignal = (
    actor: Player,
    tile: Tile,
    territorySummary?: Partial<Pick<AiTerritorySummary, "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ): number => {
    const tk = deps.key(tile.x, tile.y);
    const cached = territorySummary?.dockSignalByTileKey?.get(tk);
    if (cached !== undefined) return cached;
    const dock = deps.docksByTile.get(tk);
    if (!dock) return 0;
    let score = 140;
    const linkedDockTileKeys = deps.dockLinkedTileKeys(dock);
    score += linkedDockTileKeys.length * 32;
    for (const linkedTileKey of linkedDockTileKeys) {
      const [linkedX, linkedY] = deps.parseKey(linkedTileKey);
      const linkedTile = deps.aiTileLiteAt(linkedX, linkedY);
      if (!linkedTile.ownerId) score += 160;
      else if (linkedTile.ownerId === actor.id) score += linkedTile.ownershipState === "SETTLED" ? 70 : 110;
      else if (!actor.allies.has(linkedTile.ownerId)) score += 135;
    }
    territorySummary?.dockSignalByTileKey?.set(tk, score);
    return score;
  };

  const aiFrontierActionCandidates = (actor: Player, from: Tile, actionType: "EXPAND" | "ATTACK"): Tile[] => {
    const out = new Map<TileKey, Tile>();
    for (const neighbor of deps.adjacentNeighborCores(from.x, from.y)) {
      out.set(deps.key(neighbor.x, neighbor.y), deps.aiTileLiteAt(neighbor.x, neighbor.y));
    }
    const fromDock = deps.docksByTile.get(deps.key(from.x, from.y));
    if (!fromDock) return [...out.values()];
    for (const linkedTileKey of deps.dockLinkedTileKeys(fromDock)) {
      const [linkedX, linkedY] = deps.parseKey(linkedTileKey);
      const linkedTile = deps.aiTileLiteAt(linkedX, linkedY);
      out.set(linkedTileKey, linkedTile);
      if (actionType === "ATTACK") {
        for (const neighbor of deps.adjacentNeighborCores(linkedTile.x, linkedTile.y)) {
          out.set(deps.key(neighbor.x, neighbor.y), deps.aiTileLiteAt(neighbor.x, neighbor.y));
        }
      }
    }
    return [...out.values()];
  };

  const aiEconomicFrontierSignal = (
    actor: Player,
    tile: Tile,
    visibility = deps.visibilitySnapshotForPlayer(actor),
    foodPressure = aiFoodPressureSignal(actor),
    territorySummary?: Partial<Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ): number => {
    const tk = deps.key(tile.x, tile.y);
    const cached = territorySummary?.economicSignalByTileKey?.get(tk);
    if (cached !== undefined) return cached;
    const visibleToActor = (x: number, y: number): boolean => deps.visibleInSnapshot(visibility, x, y);
    let score = 0;
    if (visibleToActor(tile.x, tile.y)) {
      if (deps.townsByTile.has(tk)) score += 150;
      if (tile.resource) {
        score += 90 + deps.baseTileValue(tile.resource);
        if (foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH")) score += foodPressure;
      }
      score += aiDockStrategicSignal(actor, tile, territorySummary);
    }
    for (const neighbor of deps.adjacentNeighborCores(tile.x, tile.y)) {
      if (!visibleToActor(neighbor.x, neighbor.y)) continue;
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      if (deps.townsByTile.has(neighborKey)) score += 110;
      if (neighbor.resource) {
        score += 65 + Math.floor(deps.baseTileValue(neighbor.resource) * 0.6);
        if (foodPressure > 0 && (neighbor.resource === "FARM" || neighbor.resource === "FISH")) score += Math.round(foodPressure * 0.7);
      }
      if (deps.docksByTile.has(neighborKey)) score += 95 + Math.round(aiDockStrategicSignal(actor, deps.aiTileLiteAt(neighbor.x, neighbor.y), territorySummary) * 0.45);
    }
    territorySummary?.economicSignalByTileKey?.set(tk, score);
    return score;
  };

  const aiEnemyPressureSignal = (
    actor: Player,
    tile: Tile,
    visibility = deps.visibilitySnapshotForPlayer(actor),
    territorySummary?: Partial<Pick<AiTerritorySummary, "pressureSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ): number => {
    const tk = deps.key(tile.x, tile.y);
    const cached = territorySummary?.pressureSignalByTileKey?.get(tk);
    if (cached !== undefined) return cached;
    if (!tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId) || tile.ownerId === deps.BARBARIAN_OWNER_ID) return 0;
    const visibleToActor = (x: number, y: number): boolean => deps.visibleInSnapshot(visibility, x, y);
    let score = 0;
    const firstRing = deps.adjacentNeighborCores(tile.x, tile.y);
    let settledIntrusion = 0;
    let ownedIntrusion = 0;
    for (const neighbor of firstRing) {
      if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
      ownedIntrusion += 1;
      if (neighbor.ownershipState === "SETTLED") settledIntrusion += 1;
    }
    if (ownedIntrusion > 0) {
      score += 180 + ownedIntrusion * 95 + settledIntrusion * 70;
      if (tile.ownershipState === "FRONTIER") score += 260;
    }
    if (settledIntrusion > 0) score += 120 + settledIntrusion * 60;
    if (visibleToActor(tile.x, tile.y)) {
      if (deps.townsByTile.has(tk)) score += 180;
      if (tile.resource) score += 110 + deps.baseTileValue(tile.resource);
      if (deps.docksByTile.has(tk)) score += 150;
    }
    for (const neighbor of firstRing) {
      if (!visibleToActor(neighbor.x, neighbor.y)) continue;
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      if (deps.townsByTile.has(neighborKey)) score += 125;
      if (neighbor.resource) score += 85 + Math.floor(deps.baseTileValue(neighbor.resource) * 0.7);
      if (deps.docksByTile.has(neighborKey)) score += 110;
      for (const secondRing of deps.adjacentNeighborCores(neighbor.x, neighbor.y)) {
        if (!visibleToActor(secondRing.x, secondRing.y)) continue;
        const secondRingKey = deps.key(secondRing.x, secondRing.y);
        if (deps.townsByTile.has(secondRingKey)) score += 45;
        if (secondRing.resource) score += 30 + Math.floor(deps.baseTileValue(secondRing.resource) * 0.35);
        if (deps.docksByTile.has(secondRingKey)) score += 40;
      }
    }
    territorySummary?.pressureSignalByTileKey?.set(tk, score);
    return score;
  };

  const isOwnedTownSupportRingTile = (ownerId: string, tile: Tile): boolean => {
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = deps.wrapX(tile.x + dx, deps.WORLD_WIDTH);
        const ny = deps.wrapY(tile.y + dy, deps.WORLD_HEIGHT);
        const neighborKey = deps.key(nx, ny);
        if (deps.townsByTile.has(neighborKey) && deps.ownership.get(neighborKey) === ownerId && deps.ownershipStateByTile.get(neighborKey) === "SETTLED") {
          return true;
        }
      }
    }
    return false;
  };

  const cachedSupportedTownKeysForTile = (
    actorId: string,
    tileKey: TileKey,
    territorySummary?: Pick<AiTerritorySummary, "supportedTownKeysByTileKey">
  ): TileKey[] => {
    if (!territorySummary) return deps.supportedTownKeysForTile(tileKey, actorId);
    const cached = territorySummary.supportedTownKeysByTileKey.get(tileKey);
    if (cached) return cached;
    const resolved = deps.supportedTownKeysForTile(tileKey, actorId);
    territorySummary.supportedTownKeysByTileKey.set(tileKey, resolved);
    return resolved;
  };

  const pressureAttackThreatensCore = (actor: Player, candidate?: { to: Tile }): boolean => {
    if (!candidate) return false;
    for (const neighbor of deps.adjacentNeighborCores(candidate.to.x, candidate.to.y)) {
      if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      if (deps.townsByTile.has(neighborKey) || deps.docksByTile.has(neighborKey)) return true;
      if (isOwnedTownSupportRingTile(actor.id, deps.aiTileLiteAt(neighbor.x, neighbor.y))) return true;
    }
    return false;
  };

  const fortTileProtectsCore = (actor: Player, tile?: Tile): boolean => {
    if (!tile || tile.ownerId !== actor.id || tile.terrain !== "LAND") return false;
    const tk = deps.key(tile.x, tile.y);
    if (deps.townsByTile.has(tk) || deps.docksByTile.has(tk) || isOwnedTownSupportRingTile(actor.id, tile)) return true;
    for (const neighbor of deps.adjacentNeighborCores(tile.x, tile.y)) {
      if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      if (deps.townsByTile.has(neighborKey) || deps.docksByTile.has(neighborKey)) return true;
      if (isOwnedTownSupportRingTile(actor.id, deps.aiTileLiteAt(neighbor.x, neighbor.y))) return true;
    }
    return false;
  };

  const fortTileIsDockChokePoint = (tile?: Tile): boolean => {
    if (!tile) return false;
    const tk = deps.key(tile.x, tile.y);
    if (!deps.docksByTile.has(tk)) return false;
    const adjacentLandCount = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
    return adjacentLandCount <= 3;
  };

  return {
    aiEconomyPriorityState,
    aiFoodPressureSignal,
    cachedAiIslandProgress,
    aiIslandFootprintSignal,
    bestAiIslandFocusTargetId,
    aiDockStrategicSignal,
    aiFrontierActionCandidates,
    aiEconomicFrontierSignal,
    aiEnemyPressureSignal,
    isOwnedTownSupportRingTile,
    cachedSupportedTownKeysForTile,
    pressureAttackThreatensCore,
    fortTileProtectsCore,
    fortTileIsDockChokePoint
  };
};
