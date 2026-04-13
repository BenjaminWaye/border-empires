import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import type { BasicFrontierActionType } from "./server-frontier-action-types.js";
import {
  SETTLE_COST,
  type Player,
  type Tile,
  type TileKey
} from "@border-empires/shared";
import {
  CAMP_BUILD_GOLD_COST,
  CAMP_BUILD_SUPPLY_COST,
  FARMSTEAD_BUILD_FOOD_COST,
  FARMSTEAD_BUILD_GOLD_COST,
  FRONTIER_ACTION_GOLD_COST,
  GRANARY_BUILD_FOOD_COST,
  GRANARY_BUILD_GOLD_COST,
  MARKET_BUILD_GOLD_COST,
  MINE_BUILD_GOLD_COST,
  MINE_BUILD_RESOURCE_COST
} from "./server-game-constants.js";
import type { PlayerEffects } from "./server-effects.js";
import type {
  AiFrontierAvailabilityProfile,
  AiFrontierPlanningSummary,
  AiPlanningStaticCache,
  AiSettlementAvailabilityProfile,
  AiSettlementCandidateEvaluation,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierPlanningDeps {
  now: () => number;
  aiTerritoryVersionForPlayer: (playerId: string) => number;
  cachedAiPlanningStaticByPlayer: Map<string, AiPlanningStaticCache>;
  key: (x: number, y: number) => TileKey;
  visibleInSnapshot: (visibility: AiTerritorySummary["visibility"], x: number, y: number) => boolean;
  collectAiTerritorySummary: (actor: Player) => AiTerritorySummary;
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
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, unknown>;
  fortsByTile: Map<TileKey, unknown>;
  adjacentNeighborCores: (
    x: number,
    y: number
  ) => Array<{ x: number; y: number; terrain: Tile["terrain"]; ownerId: string | undefined; ownershipState: Tile["ownershipState"] | undefined; resource: Tile["resource"] | undefined }>;
  baseTileValue: (resource: Tile["resource"]) => number;
  countAiScoutRevealTiles: (to: Tile, visibility: AiTerritorySummary["visibility"], territorySummary: AiTerritorySummary) => number;
  scoreAiScoutRevealValue: (actor: Player, tile: Tile, visibility: AiTerritorySummary["visibility"], territorySummary: AiTerritorySummary) => number;
  cachedScoutAdjacencyMetrics: (
    actor: Player,
    tile: Tile,
    territorySummary: AiTerritorySummary
  ) => {
    ownedNeighbors: number;
    alliedSettledNeighbors: number;
    frontierNeighbors: number;
    coastlineDiscoveryValue: number;
    exposedSides: number;
  };
  isAiVisibleEconomicFrontierTile: (actor: Player, tile: Tile, territorySummary?: AiTerritorySummary) => boolean;
  aiEconomicFrontierSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    foodPressure?: number,
    territorySummary?: Partial<Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  cachedSupportedTownKeysForTile: (actorId: string, tileKey: TileKey, territorySummary?: Pick<AiTerritorySummary, "supportedTownKeysByTileKey">) => TileKey[];
  islandMap: () => { islandIdByTile: Map<TileKey, number> };
  aiIslandFootprintSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
  ) => number;
  bestAiIslandFocusTargetId: (actor: Player, territorySummary: AiTerritorySummary) => number | undefined;
  aiEconomyPriorityState: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ) => { foodCoverageLow: boolean; economyWeak: boolean };
  cachedAiIslandProgress: (actor: Player, territorySummary?: AiTerritorySummary) => AiTerritorySummary["islandProgress"] extends infer T ? NonNullable<T> : never;
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  getOrInitStrategicStocks: (playerId: string) => Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
  canBuildSiegeOutpostAt: (actor: Player, x: number, y: number) => { ok: boolean; reason?: string };
  isOwnedTownSupportRingTile: (ownerId: string, tile: Tile) => boolean;
  estimateAiPressureAttackProfile: (actor: Player, territorySummary: AiTerritorySummary) => { score: number; threatensCore: boolean };
  tileHasPendingSettlement: (tileKey: TileKey) => boolean;
  runtimeWarn: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerAiFrontierPlanningRuntime {
  bestAiFrontierAction: (
    actor: Player,
    kind: BasicFrontierActionType,
    filter: (tile: Tile) => boolean,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => { from: Tile; to: Tile } | undefined;
  frontierPlanningSummaryForPlayer: (actor: Player, territorySummary: AiTerritorySummary) => AiFrontierPlanningSummary;
  estimateAiSettlementAvailabilityProfile: (
    actor: Player,
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    economyWeak: boolean,
    foodCoverageLow: boolean
  ) => AiSettlementAvailabilityProfile;
  estimateAiFrontierAvailabilityProfile: (actor: Player, territorySummary: AiTerritorySummary) => AiFrontierAvailabilityProfile;
  hasAiFocusedIslandExpand: (
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    undercoveredIslandCount: number
  ) => boolean;
  buildAiPlanningStaticCache: (actor: Player, territorySummary: AiTerritorySummary) => AiPlanningStaticCache;
  cachedAiPlanningStaticForPlayer: (actor: Player, territorySummary: AiTerritorySummary) => AiPlanningStaticCache;
}

export const createServerAiFrontierPlanningRuntime = (
  deps: CreateServerAiFrontierPlanningDeps
): ServerAiFrontierPlanningRuntime => {
  const bestAiFrontierAction = (
    actor: Player,
    kind: BasicFrontierActionType,
    filter: (tile: Tile) => boolean,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    const { visibility, settledTileCount, frontierTileCount } = territorySummary;
    const earlyExpansionMode = settledTileCount <= 2;
    const economicExpansionMode = settledTileCount <= 6;
    const visibleToActor = (x: number, y: number): boolean => deps.visibleInSnapshot(visibility, x, y);
    const dockScoreForTile = (tile: Tile): number => {
      const tk = deps.key(tile.x, tile.y);
      if (!visibleToActor(tile.x, tile.y)) return 0;
      const dock = deps.docksByTile.get(tk);
      let score = 0;
      if (dock) score += 90;
      for (const neighbor of deps.adjacentNeighborCores(tile.x, tile.y)) {
        if (!visibleToActor(neighbor.x, neighbor.y) || !deps.docksByTile.get(deps.key(neighbor.x, neighbor.y))) continue;
        score += 24;
        if (neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId)) score += 22;
      }
      return score;
    };

    let best: { score: number; from: Tile; to: Tile } | undefined;
    const frontierCandidates = kind === "ATTACK" ? territorySummary.attackCandidates : territorySummary.expandCandidates;
    for (const { from, to } of frontierCandidates) {
      if (to.terrain !== "LAND" || !filter(to)) continue;
      const toVisible = visibleToActor(to.x, to.y);
      const tk = deps.key(to.x, to.y);
      const isTown = toVisible && deps.townsByTile.has(tk);
      const resourceValue = toVisible && to.resource ? deps.baseTileValue(to.resource) : 0;
      const dockValue = dockScoreForTile(to);
      const adjacentInteresting = deps.adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
        if (!visibleToActor(neighbor.x, neighbor.y)) return score;
        const neighborKey = deps.key(neighbor.x, neighbor.y);
        const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
        if (deps.townsByTile.has(neighborKey) && hostileOwner) return score + 45;
        if (neighbor.resource && hostileOwner) return score + Math.max(15, deps.baseTileValue(neighbor.resource) / 2);
        if (deps.docksByTile.has(neighborKey) && hostileOwner) return score + 35;
        return score;
      }, 0);
      const explorationValue = deps.adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
        if (visibleToActor(neighbor.x, neighbor.y)) return score;
        let next = score + 18;
        if (neighbor.terrain === "SEA") next += 10;
        return next;
      }, toVisible ? 0 : 24);
      const exposedSides = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
        if (neighbor.terrain !== "LAND") return count + 1;
        if (!neighbor.ownerId || neighbor.ownerId !== actor.id) return count + 1;
        return count;
      }, 0);
      const ownedNeighbors = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id ? 1 : 0), 0);
      const alliedSettledNeighbors = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id && neighbor.ownershipState === "SETTLED" ? 1 : 0), 0);
      const frontierNeighbors = deps.adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id && neighbor.ownershipState === "FRONTIER" ? 1 : 0), 0);
      const coastlineDiscoveryValue = deps.adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => score + (neighbor.terrain === "SEA" ? (visibleToActor(neighbor.x, neighbor.y) ? 10 : 18) : 0), 0);
      const compactnessValue = alliedSettledNeighbors * 8 - exposedSides * 12;
      const scoutShapePenalty =
        Math.max(0, ownedNeighbors - 2) * 36 +
        Math.max(0, alliedSettledNeighbors - 1) * 18 +
        Math.max(0, frontierNeighbors - 1) * 12;
      const directionalScoutValue =
        explorationValue + coastlineDiscoveryValue - scoutShapePenalty + (ownedNeighbors <= 2 ? 18 : 0) + (from.ownershipState === "FRONTIER" ? 10 : 0);
      const knownEconomicValue = isTown || resourceValue > 0 || dockValue > 0;
      const knownMilitaryValue = adjacentInteresting >= 35 || to.ownerId === "barbarian";
      const reserveAfterAction = actor.points - FRONTIER_ACTION_GOLD_COST;
      const futureSettlement =
        kind === "EXPAND" ? deps.evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([tk]), territorySummary) : undefined;
      const immediateSettlementPlan = Boolean(
        futureSettlement && actor.points >= SETTLE_COST + FRONTIER_ACTION_GOLD_COST && futureSettlement.supportsImmediatePlan
      );
      let score = kind === "ATTACK" ? 40 : 0;
      if (isTown) score += kind === "ATTACK" ? 180 : 120;
      score += resourceValue * (kind === "ATTACK" ? 1.8 : 1.25);
      score += dockValue + adjacentInteresting;
      if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue) {
        score += directionalScoutValue;
        if (immediateSettlementPlan && futureSettlement) {
          score += futureSettlement.score * 0.75;
          if (futureSettlement.isDefensivelyCompact) score += 30;
        } else {
          score += compactnessValue * 0.2;
        }
      }
      if (to.ownerId === "barbarian") score += 35;
      if (victoryPath === "TOWN_CONTROL" && isTown) score += 120;
      if (victoryPath === "ECONOMIC_HEGEMONY") {
        score += resourceValue + dockValue;
        if (isTown) score += 30;
      }
      if (victoryPath === "SETTLED_TERRITORY" && kind === "EXPAND") score += 20;
      score -= exposedSides * (kind === "ATTACK" ? 6 : 18);
      if (actor.points <= SETTLE_COST && !knownEconomicValue && adjacentInteresting < 40) score -= 80;
      if (kind === "EXPAND" && !earlyExpansionMode) {
        if (reserveAfterAction < SETTLE_COST && !knownEconomicValue && adjacentInteresting < 35) score -= 180;
        if (settledTileCount >= 2 && !knownEconomicValue && !knownMilitaryValue) score -= 45;
        if (settledTileCount >= 4 && explorationValue < 45 && !knownEconomicValue) score -= 70;
        if (frontierTileCount >= Math.max(2, settledTileCount) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) score -= 140;
      }
      if (kind === "EXPAND" && from.ownershipState !== "SETTLED" && !knownEconomicValue && explorationValue < 35) score -= 10;
      if (earlyExpansionMode && kind === "EXPAND") {
        score += 15;
        if (!knownEconomicValue) {
          score += directionalScoutValue;
          if (immediateSettlementPlan && futureSettlement) score += futureSettlement.score * 0.5;
        }
      }
      if (economicExpansionMode && kind === "EXPAND") {
        if (knownEconomicValue || explorationValue >= 40) score += 20;
        if (knownEconomicValue) score += 15;
      }
      if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue && ownedNeighbors >= 3 && !immediateSettlementPlan) score -= earlyExpansionMode ? 140 : 220;
      if (kind === "EXPAND" && frontierTileCount >= Math.max(1, settledTileCount - 1) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) score -= 220;
      if (!toVisible && kind === "ATTACK") score -= 100;
      if (!knownEconomicValue && !knownMilitaryValue && explorationValue < 20 && !earlyExpansionMode) score -= 90;
      if (!best || score > best.score) best = { score, from, to };
    }
    if (!best) return undefined;
    if (kind === "EXPAND" && earlyExpansionMode) return best;
    const minScore = kind === "ATTACK" ? (earlyExpansionMode ? 20 : 35) : earlyExpansionMode ? 0 : economicExpansionMode ? 10 : 30;
    return best.score >= minScore ? best : undefined;
  };

  const frontierPlanningSummaryForPlayer = (actor: Player, territorySummary: AiTerritorySummary): AiFrontierPlanningSummary => {
    if (territorySummary.frontierPlanningSummary) return territorySummary.frontierPlanningSummary;
    const visibility = territorySummary.visibility;
    const settledTiles = territorySummary.settledTileCount;
    let neutralExpandAvailable = false;
    let openingScoutAvailable = false;
    let scoutExpandAvailable = false;
    let economicExpandAvailable = false;
    let scaffoldExpandAvailable = false;
    let islandExpandAvailable = false;
    let frontierOpportunityEconomic = 0;
    let frontierOpportunityScout = 0;
    let frontierOpportunityScaffold = 0;
    let frontierOpportunityWaste = 0;
    let bestEconomicExpand: { score: number; from: Tile; to: Tile } | undefined;
    let bestScoutExpand: { score: number; from: Tile; to: Tile } | undefined;
    let bestScaffoldExpand: { score: number; from: Tile; to: Tile } | undefined;
    let bestIslandExpand: { score: number; from: Tile; to: Tile } | undefined;
    let bestAnyNeutralExpand: { score: number; from: Tile; to: Tile } | undefined;

    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      neutralExpandAvailable = true;
      const tileKey = deps.key(to.x, to.y);
      const adjacency = deps.cachedScoutAdjacencyMetrics(actor, to, territorySummary);
      const scoutRevealCount = deps.countAiScoutRevealTiles(to, visibility, territorySummary);
      const scoutValue = deps.scoreAiScoutRevealValue(actor, to, visibility, territorySummary);
      const scoutScore = scoutValue + scoutRevealCount * 18 + (from.ownershipState === "SETTLED" ? 8 : 0);
      if (settledTiles <= 2 && scoutRevealCount > 0) openingScoutAvailable = true;
      if (scoutRevealCount > 0) scoutExpandAvailable = true;
      const economic = deps.isAiVisibleEconomicFrontierTile(actor, to, territorySummary);
      const economicSignal = deps.aiEconomicFrontierSignal(actor, to, visibility, territorySummary.foodPressure, territorySummary);
      if (economic) economicExpandAvailable = true;
      const islandSignal = deps.aiIslandFootprintSignal(actor, to, territorySummary);
      if (islandSignal > 0) islandExpandAvailable = true;
      const scaffold =
        deps.cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0 ||
        (adjacency.ownedNeighbors >= 3 && adjacency.exposedSides <= 1) ||
        deps.townsByTile.has(tileKey) ||
        Boolean(to.resource) ||
        deps.docksByTile.has(tileKey);
      const scaffoldScore =
        (deps.cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0 ? 160 : 0) +
        (deps.townsByTile.has(tileKey) ? 180 : 0) +
        (to.resource ? 120 + deps.baseTileValue(to.resource) : 0) +
        (deps.docksByTile.has(tileKey) ? 130 : 0) +
        adjacency.ownedNeighbors * 20 -
        adjacency.exposedSides * 16 +
        (from.ownershipState === "SETTLED" ? 8 : 0);
      if (economic) {
        frontierOpportunityEconomic += 1;
        const score = 260 + economicSignal + (from.ownershipState === "SETTLED" ? 6 : 0);
        if (!bestEconomicExpand || score > bestEconomicExpand.score) bestEconomicExpand = { score, from, to };
      } else if (scaffold) {
        scaffoldExpandAvailable = true;
        frontierOpportunityScaffold += 1;
        if (!bestScaffoldExpand || scaffoldScore > bestScaffoldExpand.score) bestScaffoldExpand = { score: scaffoldScore, from, to };
      } else if (scoutRevealCount > 0 || !deps.visibleInSnapshot(visibility, to.x, to.y)) {
        frontierOpportunityScout += 1;
        if (!bestScoutExpand || scoutScore > bestScoutExpand.score) bestScoutExpand = { score: scoutScore, from, to };
      } else {
        frontierOpportunityWaste += 1;
      }
      if (islandSignal > 0) {
        const score = islandSignal + Math.round(economicSignal * 0.55) + Math.round(scoutScore * 0.45) + 120 + (from.ownershipState === "SETTLED" ? 12 : 0);
        if (!bestIslandExpand || score > bestIslandExpand.score) bestIslandExpand = { score, from, to };
      }
      const anyNeutralBase = economic ? 260 + economicSignal : scaffold ? 180 + scaffoldScore : scoutRevealCount > 0 || !deps.visibleInSnapshot(visibility, to.x, to.y) ? 120 + scoutScore : 50 + scoutScore + Math.max(0, scaffoldScore / 4);
      const anyNeutralScore = anyNeutralBase + islandSignal + (from.ownershipState === "SETTLED" ? 6 : 0);
      if (!bestAnyNeutralExpand || anyNeutralScore > bestAnyNeutralExpand.score) bestAnyNeutralExpand = { score: anyNeutralScore, from, to };
    }

    const summary: AiFrontierPlanningSummary = {
      neutralExpandAvailable,
      openingScoutAvailable,
      scoutExpandAvailable,
      economicExpandAvailable,
      scaffoldExpandAvailable,
      islandExpandAvailable,
      frontierOpportunityEconomic,
      frontierOpportunityScout,
      frontierOpportunityScaffold,
      frontierOpportunityWaste,
      ...(bestEconomicExpand ? { bestEconomicExpand: { from: bestEconomicExpand.from, to: bestEconomicExpand.to } } : {}),
      ...(bestScoutExpand ? { bestScoutExpand: { from: bestScoutExpand.from, to: bestScoutExpand.to } } : {}),
      ...(bestScaffoldExpand ? { bestScaffoldExpand: { from: bestScaffoldExpand.from, to: bestScaffoldExpand.to } } : {}),
      ...(bestIslandExpand ? { bestIslandExpand: { from: bestIslandExpand.from, to: bestIslandExpand.to } } : {}),
      ...(bestAnyNeutralExpand ? { bestAnyNeutralExpand: { from: bestAnyNeutralExpand.from, to: bestAnyNeutralExpand.to } } : {})
    };
    territorySummary.frontierPlanningSummary = summary;
    return summary;
  };

  const estimateAiSettlementAvailabilityProfile = (
    actor: Player,
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    economyWeak: boolean,
    foodCoverageLow: boolean
  ): AiSettlementAvailabilityProfile => {
    const { islandIdByTile } = deps.islandMap();
    let settlementAvailable = false;
    let townSupportSettlementAvailable = false;
    let islandSettlementAvailable = false;
    for (const tile of territorySummary.frontierTiles) {
      const tileKey = deps.key(tile.x, tile.y);
      if (deps.tileHasPendingSettlement(tileKey)) continue;
      const hasTownSupport = deps.cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0;
      const hasIntrinsicEconomicValue = deps.townsByTile.has(tileKey) || Boolean(tile.resource) || deps.docksByTile.has(tileKey);
      const isFoodTile = tile.resource === "FARM" || tile.resource === "FISH";
      if (!townSupportSettlementAvailable && hasTownSupport) townSupportSettlementAvailable = true;
      if (!settlementAvailable && (hasIntrinsicEconomicValue || hasTownSupport || isFoodTile || (!economyWeak && !foodCoverageLow && !territorySummary.underThreat))) {
        settlementAvailable = true;
      }
      if (!islandSettlementAvailable) {
        const islandId = islandIdByTile.get(tileKey);
        const matchesFocus = focusIslandId !== undefined ? islandId === focusIslandId : islandId !== undefined;
        if (matchesFocus && (hasIntrinsicEconomicValue || hasTownSupport || isFoodTile || (!economyWeak && !foodCoverageLow && !territorySummary.underThreat))) {
          islandSettlementAvailable = true;
        }
      }
      if (settlementAvailable && townSupportSettlementAvailable && islandSettlementAvailable) break;
    }
    return { settlementAvailable, townSupportSettlementAvailable, islandSettlementAvailable };
  };

  const hasAiFocusedIslandExpand = (
    territorySummary: AiTerritorySummary,
    focusIslandId: number | undefined,
    undercoveredIslandCount: number
  ): boolean => {
    if (undercoveredIslandCount <= 0) return false;
    const { islandIdByTile } = deps.islandMap();
    for (const { to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const islandId = islandIdByTile.get(deps.key(to.x, to.y));
      if (focusIslandId === undefined ? islandId !== undefined : islandId === focusIslandId) return true;
    }
    return false;
  };

  const estimateAiFrontierAvailabilityProfile = (actor: Player, territorySummary: AiTerritorySummary): AiFrontierAvailabilityProfile => {
    let frontierOpportunityScaffold = 0;
    let frontierOpportunityScout = 0;
    for (const { to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const tileKey = deps.key(to.x, to.y);
      if (deps.townsByTile.has(tileKey) || deps.docksByTile.has(tileKey) || Boolean(to.resource)) continue;
      const adjacency = deps.cachedScoutAdjacencyMetrics(actor, to, territorySummary);
      if (adjacency.ownedNeighbors >= 3 && adjacency.exposedSides <= 1) {
        frontierOpportunityScaffold += 1;
      } else if (deps.countAiScoutRevealTiles(to, territorySummary.visibility, territorySummary) > 0 || adjacency.coastlineDiscoveryValue > 0) {
        frontierOpportunityScout += 1;
      }
    }
    const frontierOpportunityEconomic = territorySummary.neutralEconomicExpandCount;
    return {
      neutralExpandAvailable: territorySummary.neutralLandExpandCount > 0,
      openingScoutAvailable: territorySummary.settledTileCount <= 2 && frontierOpportunityScout > 0,
      scoutExpandAvailable: frontierOpportunityScout > 0,
      economicExpandAvailable: territorySummary.neutralEconomicExpandCount > 0,
      scaffoldExpandAvailable: frontierOpportunityScaffold > 0,
      frontierOpportunityEconomic,
      frontierOpportunityScout,
      frontierOpportunityScaffold,
      frontierOpportunityWaste: Math.max(0, territorySummary.neutralLandExpandCount - frontierOpportunityEconomic - frontierOpportunityScout - frontierOpportunityScaffold)
    };
  };

  const buildAiPlanningStaticCache = (actor: Player, territorySummary: AiTerritorySummary): AiPlanningStaticCache => {
    let fortAvailable = false;
    let fortProtectsCore = false;
    let fortIsDockChokePoint = false;
    let economicBuildAvailable = false;
    let siegeOutpostAvailable = false;
    const islandProgress = deps.cachedAiIslandProgress(actor, territorySummary);
    const undercoveredIslandCount = islandProgress.undercoveredIslandCount;
    const focusIslandId = deps.bestAiIslandFocusTargetId(actor, territorySummary);
    const focusLand = focusIslandId !== undefined ? islandProgress.landCounts.get(focusIslandId) ?? 0 : 0;
    const weakestIslandRatio = focusIslandId !== undefined ? (focusLand > 0 ? (islandProgress.settledCounts.get(focusIslandId) ?? 0) / focusLand : islandProgress.weakestRatio) : islandProgress.weakestRatio;
    const { economyWeak, foodCoverageLow } = deps.aiEconomyPriorityState(actor, territorySummary);
    const settlementAvailability = estimateAiSettlementAvailabilityProfile(actor, territorySummary, focusIslandId, economyWeak, foodCoverageLow);
    const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);

    if (territorySummary.structureCandidateTiles.length > 0) {
      const playerEffects = deps.getPlayerEffectsForPlayer(actor.id);
      const stock = deps.getOrInitStrategicStocks(actor.id);
      const canPlaceGranary = playerEffects.unlockGranary && actor.points >= GRANARY_BUILD_GOLD_COST && (stock.FOOD ?? 0) >= GRANARY_BUILD_FOOD_COST;
      const canPlaceFarmstead = actor.techIds.has("agriculture") && actor.points >= FARMSTEAD_BUILD_GOLD_COST && (stock.FOOD ?? 0) >= FARMSTEAD_BUILD_FOOD_COST;
      const canPlaceCamp = actor.techIds.has("leatherworking") && actor.points >= CAMP_BUILD_GOLD_COST && (stock.SUPPLY ?? 0) >= CAMP_BUILD_SUPPLY_COST;
      const canPlaceMine = actor.techIds.has("mining") && actor.points >= MINE_BUILD_GOLD_COST;
      const canPlaceMarket = actor.techIds.has("trade") && actor.points >= MARKET_BUILD_GOLD_COST;
      for (const tile of territorySummary.structureCandidateTiles) {
        const tk = deps.key(tile.x, tile.y);
        if (!fortAvailable && !deps.fortsByTile.has(tk) && (deps.docksByTile.has(tk) || territorySummary.borderSettledTileKeys.has(tk))) {
          fortAvailable = true;
          fortProtectsCore = deps.townsByTile.has(tk) || deps.docksByTile.has(tk) || deps.isOwnedTownSupportRingTile(actor.id, tile);
          if (deps.docksByTile.has(tk)) {
            const adjacentLandCount = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
            fortIsDockChokePoint = adjacentLandCount <= 3;
          }
        }
        if (!siegeOutpostAvailable && deps.canBuildSiegeOutpostAt(actor, tile.x, tile.y).ok) {
          const hostileAdjacency = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
            if (neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return count;
            return count + 1;
          }, 0);
          if (hostileAdjacency > 0) siegeOutpostAvailable = true;
        }
        if (economicBuildAvailable || tile.economicStructure) continue;
        if ((tile.resource === "FARM" || tile.resource === "FISH") && (canPlaceFarmstead || canPlaceGranary)) economicBuildAvailable = true;
        else if ((tile.resource === "FUR" || tile.resource === "WOOD") && (canPlaceCamp || canPlaceMarket)) economicBuildAvailable = true;
        else if ((tile.resource === "IRON" || tile.resource === "GEMS") && (canPlaceMarket || (canPlaceMine && ((tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) >= MINE_BUILD_RESOURCE_COST))) economicBuildAvailable = true;
        else if (deps.townsByTile.has(tk) && (canPlaceMarket || canPlaceGranary)) economicBuildAvailable = true;
      }
    }

    const pressureAttackProfile = deps.estimateAiPressureAttackProfile(actor, territorySummary);
    return {
      version: deps.aiTerritoryVersionForPlayer(actor.id),
      openingScoutAvailable: frontierAvailability.openingScoutAvailable,
      neutralExpandAvailable: frontierAvailability.neutralExpandAvailable,
      economicExpandAvailable: frontierAvailability.economicExpandAvailable,
      scoutExpandAvailable: frontierAvailability.scoutExpandAvailable,
      scaffoldExpandAvailable: frontierAvailability.scaffoldExpandAvailable,
      barbarianAttackAvailable: territorySummary.barbarianAttackAvailable,
      enemyAttackAvailable: territorySummary.enemyAttackAvailable,
      pressureAttackScore: pressureAttackProfile.score,
      pressureThreatensCore: pressureAttackProfile.threatensCore,
      settlementAvailable: settlementAvailability.settlementAvailable,
      townSupportSettlementAvailable: settlementAvailability.townSupportSettlementAvailable,
      islandExpandAvailable: hasAiFocusedIslandExpand(territorySummary, focusIslandId, undercoveredIslandCount),
      islandSettlementAvailable: settlementAvailability.islandSettlementAvailable,
      weakestIslandRatio,
      undercoveredIslandCount,
      fortAvailable,
      fortProtectsCore,
      fortIsDockChokePoint,
      economicBuildAvailable,
      siegeOutpostAvailable,
      frontierOpportunityEconomic: frontierAvailability.frontierOpportunityEconomic,
      frontierOpportunityScout: frontierAvailability.frontierOpportunityScout,
      frontierOpportunityScaffold: frontierAvailability.frontierOpportunityScaffold,
      frontierOpportunityWaste: frontierAvailability.frontierOpportunityWaste
    };
  };

  const cachedAiPlanningStaticForPlayer = (actor: Player, territorySummary: AiTerritorySummary): AiPlanningStaticCache => {
    const version = deps.aiTerritoryVersionForPlayer(actor.id);
    const cached = deps.cachedAiPlanningStaticByPlayer.get(actor.id);
    if (cached && cached.version === version) return cached;
    const startedAt = deps.now();
    const rebuilt = buildAiPlanningStaticCache(actor, territorySummary);
    const elapsedMs = deps.now() - startedAt;
    if (elapsedMs >= 150) {
      deps.runtimeWarn(
        {
          playerId: actor.id,
          frontierTiles: territorySummary.frontierTileCount,
          expandCandidates: territorySummary.expandCandidates.length,
          attackCandidates: territorySummary.attackCandidates.length,
          structureCandidates: territorySummary.structureCandidateTiles.length,
          elapsedMs
        },
        "slow ai planning static cache"
      );
    }
    deps.cachedAiPlanningStaticByPlayer.set(actor.id, rebuilt);
    return rebuilt;
  };

  return {
    bestAiFrontierAction,
    frontierPlanningSummaryForPlayer,
    estimateAiSettlementAvailabilityProfile,
    estimateAiFrontierAvailabilityProfile,
    hasAiFocusedIslandExpand,
    buildAiPlanningStaticCache,
    cachedAiPlanningStaticForPlayer
  };
};
