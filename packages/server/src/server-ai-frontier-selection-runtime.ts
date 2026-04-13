import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import type { AiExecuteCandidate } from "./ai/execute-candidate-cache.js";
import {
  type EconomicStructureType,
  type Player,
  type Tile,
  type TileKey
} from "@border-empires/shared";
import {
  CAMP_BUILD_GOLD_COST,
  CAMP_BUILD_SUPPLY_COST,
  FARMSTEAD_BUILD_FOOD_COST,
  FARMSTEAD_BUILD_GOLD_COST,
  GRANARY_BUILD_FOOD_COST,
  GRANARY_BUILD_GOLD_COST,
  MARKET_BUILD_GOLD_COST,
  MINE_BUILD_GOLD_COST,
  MINE_BUILD_RESOURCE_COST
} from "./server-game-constants.js";
import type { PlayerEffects } from "./server-effects.js";
import type { PlayerCompetitionMetrics, StrategicResource, TownDefinition } from "./server-shared-types.js";
import type {
  AiFrontierOpportunityCounts,
  AiSettlementCandidateEvaluation,
  AiSettlementSelectorCache,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierSelectionDeps {
  aiTerritoryVersionForPlayer: (playerId: string) => number;
  pendingSettlementCountForPlayer: (playerId: string) => number;
  cachedAiSettlementSelectorByPlayer: Map<string, AiSettlementSelectorCache>;
  now: () => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  aiTileLiteAt: (x: number, y: number) => Tile;
  collectAiTerritorySummary: (actor: Player) => AiTerritorySummary;
  islandMap: () => { islandIdByTile: Map<TileKey, number> };
  aiEconomyPriorityState: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ) => { foodCoverageLow: boolean; economyWeak: boolean };
  bestAiIslandFocusTargetId: (actor: Player, territorySummary: AiTerritorySummary) => number | undefined;
  tileHasPendingSettlement: (tileKey: TileKey) => boolean;
  evaluateAiSettlementCandidate: (
    actor: Player,
    tile: Tile,
    victoryPath?: AiSeasonVictoryPathId,
    assumedFrontierKeys?: ReadonlySet<TileKey>,
    territorySummary?: Pick<
      AiTerritorySummary,
      "visibility" | "foodPressure" | "settlementEvaluationByKey" | "islandFootprintSignalByTileKey" | "islandProgress"
    >
  ) => AiSettlementCandidateEvaluation;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, unknown>;
  fortsByTile: Map<TileKey, unknown>;
  economicStructuresByTile: Map<TileKey, { ownerId: string; type: EconomicStructureType; status?: string }>;
  adjacentNeighborCores: (
    x: number,
    y: number
  ) => Array<{ x: number; y: number; terrain: Tile["terrain"]; ownerId: string | undefined; ownershipState: Tile["ownershipState"] | undefined; resource: Tile["resource"] | undefined }>;
  isBorderTile: (x: number, y: number, ownerId: string) => boolean;
  baseTileValue: (resource: Tile["resource"]) => number;
  getOrInitStrategicStocks: (playerId: string) => Partial<Record<StrategicResource, number>>;
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  canPlaceEconomicStructure: (actor: Player, tile: Tile, structureType: EconomicStructureType) => { ok: boolean; reason?: string };
  canBuildSiegeOutpostAt: (actor: Player, x: number, y: number) => { ok: boolean; reason?: string };
  collectPlayerCompetitionMetrics: () => PlayerCompetitionMetrics[];
  uniqueLeader: (values: Array<{ playerId: string; value: number }>) => { playerId?: string };
  leadingPair: (values: Array<{ playerId: string; value: number }>) => { leaderPlayerId?: string };
  classifyAiNeutralFrontierOpportunity: (
    actor: Player,
    from: Tile,
    to: Tile,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => "economic" | "scaffold" | "scout" | "waste";
  aiEconomicFrontierSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    foodPressure?: number,
    territorySummary?: Partial<Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  scoreAiScoutExpandCandidate: (
    actor: Player,
    from: Tile,
    to: Tile,
    visibility?: AiTerritorySummary["visibility"],
    territorySummary?: AiTerritorySummary
  ) => number;
  aiIslandFootprintSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
  ) => number;
  aiVictoryPathForPlayer: (playerId: string) => AiSeasonVictoryPathId | undefined;
  runtimeWarn: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerAiFrontierSelectionRuntime {
  aiSettlementSelectorCacheForPlayer: (actor: Player) => AiSettlementSelectorCache;
  cachedAiTileFromKey: (tileKey: TileKey | null | undefined) => Tile | undefined;
  aiFrontierCandidateFromExecuteCandidate: (candidate: AiExecuteCandidate | null | undefined) => { from: Tile; to: Tile } | undefined;
  aiTileCandidateFromExecuteCandidate: (candidate: AiExecuteCandidate | null | undefined) => Tile | undefined;
  frontierSettlementSummaryForPlayer: (
    actor: Player,
    victoryPath: AiSeasonVictoryPathId | undefined,
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    economyWeak: boolean,
    foodCoverageLow: boolean
  ) => {
    bestSettlementKey: TileKey | null;
    settlementAvailable: boolean;
    bestTownSupportSettlementKey: TileKey | null;
    townSupportSettlementAvailable: boolean;
    bestIslandSettlementKey: TileKey | null;
    islandSettlementAvailable: boolean;
  };
  bestAiSettlementTile: (actor: Player, victoryPath?: AiSeasonVictoryPathId, territorySummary?: AiTerritorySummary) => Tile | undefined;
  bestAiIslandSettlementTile: (actor: Player, territorySummary?: AiTerritorySummary) => Tile | undefined;
  bestAiTownSupportSettlementTile: (actor: Player, victoryPath?: AiSeasonVictoryPathId, territorySummary?: AiTerritorySummary) => Tile | undefined;
  bestAiFortTile: (actor: Player, territorySummary?: AiTerritorySummary) => Tile | undefined;
  bestAiEconomicStructure: (
    actor: Player,
    territorySummary?: AiTerritorySummary
  ) => { tile: Tile; structureType: EconomicStructureType } | undefined;
  bestAiSiegeOutpostTile: (actor: Player, victoryPath?: AiSeasonVictoryPathId, territorySummary?: AiTerritorySummary) => Tile | undefined;
  bestAiAnyNeutralExpand: (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => { from: Tile; to: Tile } | undefined;
  aiFrontierOpportunityCounts: (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => AiFrontierOpportunityCounts;
}

const frontierSettlementSummaryCacheKey = (
  victoryPath: AiSeasonVictoryPathId | undefined,
  focusIslandId: number | undefined,
  economyWeak: boolean,
  foodCoverageLow: boolean
): string => `${victoryPath ?? "none"}|${focusIslandId ?? -1}|${economyWeak ? 1 : 0}|${foodCoverageLow ? 1 : 0}`;

export const createServerAiFrontierSelectionRuntime = (
  deps: CreateServerAiFrontierSelectionDeps
): ServerAiFrontierSelectionRuntime => {
  const aiSettlementSelectorCacheForPlayer = (actor: Player): AiSettlementSelectorCache => {
    const version = deps.aiTerritoryVersionForPlayer(actor.id);
    const pendingSettlementCount = deps.pendingSettlementCountForPlayer(actor.id);
    const cached = deps.cachedAiSettlementSelectorByPlayer.get(actor.id);
    if (cached && cached.version === version && cached.pendingSettlementCount === pendingSettlementCount) return cached;
    const rebuilt: AiSettlementSelectorCache = {
      version,
      pendingSettlementCount,
      settlementByVictoryPath: new Map<string, TileKey | null>(),
      townSupportSettlementByVictoryPath: new Map<string, TileKey | null>(),
      islandSettlementByVictoryPath: new Map<string, TileKey | null>(),
      frontierSummaryByKey: new Map()
    };
    deps.cachedAiSettlementSelectorByPlayer.set(actor.id, rebuilt);
    return rebuilt;
  };

  const cachedAiTileFromKey = (tileKey: TileKey | null | undefined): Tile | undefined =>
    tileKey ? deps.aiTileLiteAt(...deps.parseKey(tileKey)) : undefined;

  const aiFrontierCandidateFromExecuteCandidate = (candidate: AiExecuteCandidate | null | undefined): { from: Tile; to: Tile } | undefined => {
    if (!candidate || candidate.kind !== "frontier") return undefined;
    const from = cachedAiTileFromKey(candidate.originTileKey);
    const to = cachedAiTileFromKey(candidate.targetTileKey);
    return from && to ? { from, to } : undefined;
  };

  const aiTileCandidateFromExecuteCandidate = (candidate: AiExecuteCandidate | null | undefined): Tile | undefined =>
    candidate && candidate.kind === "tile" ? cachedAiTileFromKey(candidate.tileKey) : undefined;

  const frontierSettlementSummaryForPlayer = (
    actor: Player,
    victoryPath: AiSeasonVictoryPathId | undefined,
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    economyWeak: boolean,
    foodCoverageLow: boolean
  ) => {
    const selectorCache = aiSettlementSelectorCacheForPlayer(actor);
    const cacheKey = frontierSettlementSummaryCacheKey(victoryPath, focusIslandId, economyWeak, foodCoverageLow);
    const cached = selectorCache.frontierSummaryByKey.get(cacheKey);
    if (cached) return cached;
    const startedAt = deps.now();
    const { islandIdByTile } = deps.islandMap();
    let bestSettlement: (AiSettlementCandidateEvaluation & { tileKey: TileKey; priorityScore: number }) | undefined;
    let bestTownSupport: (AiSettlementCandidateEvaluation & { tileKey: TileKey; totalScore: number }) | undefined;
    let bestIsland: (AiSettlementCandidateEvaluation & { tileKey: TileKey; totalScore: number }) | undefined;

    for (const tile of territorySummary.frontierTiles) {
      const tileKey = deps.key(tile.x, tile.y);
      if (deps.tileHasPendingSettlement(tileKey)) continue;
      const evaluation = deps.evaluateAiSettlementCandidate(actor, tile, victoryPath, undefined, territorySummary);
      const hasIntrinsicEconomicValue = deps.townsByTile.has(tileKey) || Boolean(tile.resource) || deps.docksByTile.has(tileKey);
      const settlementPriorityScore =
        evaluation.score +
        (hasIntrinsicEconomicValue ? 480 : 0) +
        (evaluation.townSupportSignal > 0 ? 980 + evaluation.townSupportSignal * 2 : 0) +
        (victoryPath === "SETTLED_TERRITORY" ? evaluation.islandFootprintSignal : 0);

      if (
        (evaluation.isEconomicallyInteresting || evaluation.isStrategicallyInteresting) &&
        !(
          (economyWeak || territorySummary.underThreat || foodCoverageLow) &&
          !hasIntrinsicEconomicValue &&
          tile.resource !== "FARM" &&
          tile.resource !== "FISH" &&
          evaluation.townSupportSignal <= 0 &&
          !(victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180 && !foodCoverageLow && !economyWeak)
        )
      ) {
        const minScore =
          hasIntrinsicEconomicValue || (victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180)
            ? 20
            : victoryPath === "SETTLED_TERRITORY"
              ? 32
              : 55;
        if (
          evaluation.score >= minScore &&
          (!bestSettlement ||
            settlementPriorityScore > bestSettlement.priorityScore ||
            (settlementPriorityScore === bestSettlement.priorityScore && evaluation.score > bestSettlement.score))
        ) {
          bestSettlement = { ...evaluation, tileKey, priorityScore: settlementPriorityScore };
        }
      }

      if (evaluation.townSupportSignal > 0) {
        const townSupportScore = evaluation.townSupportSignal * 2 + evaluation.score;
        if (townSupportScore >= 160 && (!bestTownSupport || townSupportScore > bestTownSupport.totalScore)) {
          bestTownSupport = { ...evaluation, tileKey, totalScore: townSupportScore };
        }
      }

      const islandId = islandIdByTile.get(tileKey);
      if (focusIslandId !== undefined && islandId !== focusIslandId) continue;
      const islandEvaluation =
        victoryPath === "SETTLED_TERRITORY"
          ? evaluation
          : deps.evaluateAiSettlementCandidate(actor, tile, "SETTLED_TERRITORY", undefined, territorySummary);
      if (islandEvaluation.islandFootprintSignal <= 0) continue;
      const islandScore =
        islandEvaluation.score +
        islandEvaluation.islandFootprintSignal +
        (islandEvaluation.townSupportSignal > 0 ? islandEvaluation.townSupportSignal * 2 : 0) +
        140;
      if (islandScore >= 120 && (!bestIsland || islandScore > bestIsland.totalScore)) {
        bestIsland = { ...islandEvaluation, tileKey, totalScore: islandScore };
      }
    }

    const summary = {
      bestSettlementKey: bestSettlement?.tileKey ?? null,
      settlementAvailable: Boolean(bestSettlement),
      bestTownSupportSettlementKey: bestTownSupport?.tileKey ?? null,
      townSupportSettlementAvailable: Boolean(bestTownSupport),
      bestIslandSettlementKey: bestIsland?.tileKey ?? null,
      islandSettlementAvailable: Boolean(bestIsland)
    };

    selectorCache.frontierSummaryByKey.set(cacheKey, summary);
    selectorCache.settlementByVictoryPath.set(victoryPath ?? "", summary.bestSettlementKey);
    selectorCache.townSupportSettlementByVictoryPath.set(victoryPath ?? "", summary.bestTownSupportSettlementKey);
    if (focusIslandId !== undefined || victoryPath === "SETTLED_TERRITORY") {
      selectorCache.islandSettlementByVictoryPath.set(victoryPath ?? "", summary.bestIslandSettlementKey);
    }
    const elapsedMs = deps.now() - startedAt;
    if (elapsedMs >= 150) {
      deps.runtimeWarn(
        { playerId: actor.id, victoryPath: victoryPath ?? "none", frontierTiles: territorySummary.frontierTileCount, focusIslandId, elapsedMs },
        "slow ai frontier settlement summary"
      );
    }
    return summary;
  };

  const bestAiSettlementTile = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): Tile | undefined => {
    const { foodCoverageLow, economyWeak } = deps.aiEconomyPriorityState(actor, territorySummary);
    const summary = frontierSettlementSummaryForPlayer(actor, victoryPath, territorySummary, undefined, economyWeak, foodCoverageLow);
    return cachedAiTileFromKey(summary.bestSettlementKey);
  };

  const bestAiIslandSettlementTile = (actor: Player, territorySummary = deps.collectAiTerritorySummary(actor)): Tile | undefined => {
    const focusIslandId = deps.bestAiIslandFocusTargetId(actor, territorySummary);
    const { foodCoverageLow, economyWeak } = deps.aiEconomyPriorityState(actor, territorySummary);
    const summary = frontierSettlementSummaryForPlayer(
      actor,
      "SETTLED_TERRITORY",
      territorySummary,
      focusIslandId,
      economyWeak,
      foodCoverageLow
    );
    return cachedAiTileFromKey(summary.bestIslandSettlementKey);
  };

  const bestAiTownSupportSettlementTile = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): Tile | undefined => {
    const { foodCoverageLow, economyWeak } = deps.aiEconomyPriorityState(actor, territorySummary);
    const summary = frontierSettlementSummaryForPlayer(actor, victoryPath, territorySummary, undefined, economyWeak, foodCoverageLow);
    return cachedAiTileFromKey(summary.bestTownSupportSettlementKey);
  };

  const bestAiFortTile = (actor: Player, territorySummary = deps.collectAiTerritorySummary(actor)): Tile | undefined => {
    let best: { tile: Tile; score: number } | undefined;
    for (const tile of territorySummary.structureCandidateTiles) {
      const tk = deps.key(tile.x, tile.y);
      if (deps.fortsByTile.has(tk)) continue;
      if (!deps.docksByTile.has(tk) && !deps.isBorderTile(tile.x, tile.y, actor.id)) continue;
      let score = 0;
      if (deps.townsByTile.has(tk)) score += 140;
      if (deps.docksByTile.has(tk)) score += 120;
      if (tile.resource) score += deps.baseTileValue(tile.resource) * 2;
      const adjacentLandCount = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
      const isChokePoint = adjacentLandCount <= 3;
      if (isChokePoint) score += 70;
      if (deps.docksByTile.has(tk) && isChokePoint) score += 110;
      const hostileAdjacency = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
        if (neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return count;
        return count + 1;
      }, 0);
      const neutralAdjacency = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
        if (neighbor.terrain !== "LAND" || neighbor.ownerId) return count;
        return count + 1;
      }, 0);
      score += hostileAdjacency * 24;
      score += neutralAdjacency * (deps.docksByTile.has(tk) ? 10 : 4);
      if (!best || score > best.score) best = { tile, score };
    }
    return best && best.score >= 70 ? best.tile : undefined;
  };

  const bestAiEconomicStructure = (
    actor: Player,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { tile: Tile; structureType: EconomicStructureType } | undefined => {
    const stock = deps.getOrInitStrategicStocks(actor.id);
    const { foodCoverageLow } = deps.aiEconomyPriorityState(actor, territorySummary);
    const economicVictoryBias = deps.aiVictoryPathForPlayer(actor.id) === "ECONOMIC_HEGEMONY";
    let best: { score: number; tile: Tile; structureType: EconomicStructureType } | undefined;
    const consider = (score: number, tile: Tile, structureType: EconomicStructureType): void => {
      if (!best || score > best.score) best = { score, tile, structureType };
    };

    for (const tile of territorySummary.structureCandidateTiles) {
      const tileKey = deps.key(tile.x, tile.y);
      if (tile.economicStructure) continue;
      if (tile.resource === "FARM" || tile.resource === "FISH") {
        consider(foodCoverageLow ? 190 : 60, tile, "FARMSTEAD");
        consider(foodCoverageLow ? 140 : 28, tile, "GRANARY");
      } else if (tile.resource === "FUR" || tile.resource === "WOOD") {
        consider(economicVictoryBias ? 52 : 40, tile, "CAMP");
        consider(economicVictoryBias ? 36 : 20, tile, "MARKET");
      } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
        consider(economicVictoryBias ? 58 : 45, tile, "MINE");
        consider(economicVictoryBias ? 34 : 22, tile, "MARKET");
      } else if (deps.townsByTile.has(tileKey)) {
        consider(foodCoverageLow ? 160 : economicVictoryBias ? 54 : 35, tile, foodCoverageLow ? "GRANARY" : "MARKET");
        consider(foodCoverageLow ? 132 : 22, tile, "GRANARY");
        consider(economicVictoryBias ? 44 : 20, tile, "MARKET");
      }
    }

    if (best) {
      const placed = deps.canPlaceEconomicStructure(actor, best.tile, best.structureType);
      if (!placed.ok) best = undefined;
      else if (best.structureType === "FARMSTEAD" && (!actor.techIds.has("agriculture") || actor.points < FARMSTEAD_BUILD_GOLD_COST || (stock.FOOD ?? 0) < FARMSTEAD_BUILD_FOOD_COST)) best = undefined;
      else if (best.structureType === "CAMP" && (!actor.techIds.has("leatherworking") || actor.points < CAMP_BUILD_GOLD_COST || (stock.SUPPLY ?? 0) < CAMP_BUILD_SUPPLY_COST)) best = undefined;
      else if (best.structureType === "MINE" && (!actor.techIds.has("mining") || actor.points < MINE_BUILD_GOLD_COST || ((best.tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) < MINE_BUILD_RESOURCE_COST)) best = undefined;
      else if (best.structureType === "MARKET" && (!actor.techIds.has("trade") || actor.points < MARKET_BUILD_GOLD_COST)) best = undefined;
      else if (best.structureType === "GRANARY" && (!deps.getPlayerEffectsForPlayer(actor.id).unlockGranary || actor.points < GRANARY_BUILD_GOLD_COST || (stock.FOOD ?? 0) < GRANARY_BUILD_FOOD_COST)) best = undefined;
      else return { tile: best.tile, structureType: best.structureType };
    }

    for (const tile of territorySummary.structureCandidateTiles) {
      const tileKey = deps.key(tile.x, tile.y);
      if (tile.economicStructure) continue;
      const candidates: EconomicStructureType[] =
        tile.resource === "FARM" || tile.resource === "FISH"
          ? ["FARMSTEAD", "GRANARY"]
          : tile.resource === "FUR" || tile.resource === "WOOD"
            ? ["CAMP", "MARKET"]
            : tile.resource === "IRON" || tile.resource === "GEMS"
              ? ["MINE", "MARKET"]
              : deps.townsByTile.has(tileKey)
                ? ["MARKET", "GRANARY"]
                : [];
      for (const structureType of candidates) {
        const placed = deps.canPlaceEconomicStructure(actor, tile, structureType);
        if (!placed.ok) continue;
        if (structureType === "FARMSTEAD" && (!actor.techIds.has("agriculture") || actor.points < FARMSTEAD_BUILD_GOLD_COST || (stock.FOOD ?? 0) < FARMSTEAD_BUILD_FOOD_COST)) continue;
        if (structureType === "CAMP" && (!actor.techIds.has("leatherworking") || actor.points < CAMP_BUILD_GOLD_COST || (stock.SUPPLY ?? 0) < CAMP_BUILD_SUPPLY_COST)) continue;
        if (structureType === "MINE" && (!actor.techIds.has("mining") || actor.points < MINE_BUILD_GOLD_COST || ((tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) < MINE_BUILD_RESOURCE_COST)) continue;
        if (structureType === "MARKET" && (!actor.techIds.has("trade") || actor.points < MARKET_BUILD_GOLD_COST)) continue;
        if (structureType === "GRANARY" && (!deps.getPlayerEffectsForPlayer(actor.id).unlockGranary || actor.points < GRANARY_BUILD_GOLD_COST || (stock.FOOD ?? 0) < GRANARY_BUILD_FOOD_COST)) continue;
        return { tile, structureType };
      }
    }
    return undefined;
  };

  const bestAiSiegeOutpostTile = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): Tile | undefined => {
    const competitionMetrics = deps.collectPlayerCompetitionMetrics();
    const townLeaderId = deps.uniqueLeader(competitionMetrics.map((metric) => ({ playerId: metric.playerId, value: metric.controlledTowns }))).playerId;
    const incomeLeaderId = deps.leadingPair(competitionMetrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute }))).leaderPlayerId;
    let best: { tile: Tile; score: number } | undefined;
    for (const tile of territorySummary.structureCandidateTiles) {
      if (!deps.canBuildSiegeOutpostAt(actor, tile.x, tile.y).ok) continue;
      let hostileAdjacency = 0;
      let townPressure = 0;
      let economicPressure = 0;
      let leaderPressure = 0;
      for (const neighbor of deps.adjacentNeighborCores(tile.x, tile.y)) {
        if (neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) continue;
        hostileAdjacency += 1;
        const neighborKey = deps.key(neighbor.x, neighbor.y);
        if (deps.townsByTile.has(neighborKey)) townPressure += 1;
        if (deps.docksByTile.has(neighborKey) || deps.economicStructuresByTile.has(neighborKey) || Boolean(neighbor.resource)) economicPressure += 1;
        if ((victoryPath === "TOWN_CONTROL" && neighbor.ownerId === townLeaderId) || (victoryPath === "ECONOMIC_HEGEMONY" && neighbor.ownerId === incomeLeaderId)) {
          leaderPressure += 1;
        }
      }
      if (hostileAdjacency <= 0) continue;
      const tileKey = deps.key(tile.x, tile.y);
      let score = hostileAdjacency * 120 + townPressure * 140 + economicPressure * 90 + leaderPressure * 180;
      if (victoryPath === "TOWN_CONTROL") score += townPressure * 140;
      if (victoryPath === "ECONOMIC_HEGEMONY") score += economicPressure * 140;
      if (deps.townsByTile.has(tileKey)) score += 50;
      if (deps.docksByTile.has(tileKey)) score += 70;
      const adjacentLandCount = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
      if (adjacentLandCount <= 3) score += 60;
      if (!best || score > best.score) best = { tile, score };
    }
    return best && best.score >= 180 ? best.tile : undefined;
  };

  const bestAiAnyNeutralExpand = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const frontierClass = deps.classifyAiNeutralFrontierOpportunity(actor, from, to, victoryPath, territorySummary);
      const economicSignal = deps.aiEconomicFrontierSignal(actor, to, territorySummary.visibility, territorySummary.foodPressure, territorySummary);
      const scoutScore = deps.scoreAiScoutExpandCandidate(actor, from, to, territorySummary.visibility, territorySummary);
      const settlementEvaluation = deps.evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([deps.key(to.x, to.y)]), territorySummary);
      const islandSignal = victoryPath === "SETTLED_TERRITORY" ? deps.aiIslandFootprintSignal(actor, to, territorySummary) : 0;
      let score =
        frontierClass === "economic"
          ? 260 + economicSignal
          : frontierClass === "scaffold"
            ? 180 + settlementEvaluation.score
            : frontierClass === "scout"
              ? 120 + scoutScore
              : 50 + scoutScore + Math.max(0, settlementEvaluation.score);
      score += islandSignal;
      if (from.ownershipState === "SETTLED") score += 6;
      if (!best || score > best.score) best = { score, from, to };
    }
    return best;
  };

  const aiFrontierOpportunityCounts = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): AiFrontierOpportunityCounts => {
    const counts: AiFrontierOpportunityCounts = { economic: 0, scout: 0, scaffold: 0, waste: 0 };
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      counts[deps.classifyAiNeutralFrontierOpportunity(actor, from, to, victoryPath, territorySummary)] += 1;
    }
    return counts;
  };

  return {
    aiSettlementSelectorCacheForPlayer,
    cachedAiTileFromKey,
    aiFrontierCandidateFromExecuteCandidate,
    aiTileCandidateFromExecuteCandidate,
    frontierSettlementSummaryForPlayer,
    bestAiSettlementTile,
    bestAiIslandSettlementTile,
    bestAiTownSupportSettlementTile,
    bestAiFortTile,
    bestAiEconomicStructure,
    bestAiSiegeOutpostTile,
    bestAiAnyNeutralExpand,
    aiFrontierOpportunityCounts
  };
};
