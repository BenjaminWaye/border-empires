import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import type { OwnershipState, Player, Tile, TileKey } from "@border-empires/shared";
import type { RuntimeTileCore } from "./server-shared-types.js";
import type {
  AiNeutralFrontierClass,
  AiSettlementCandidateEvaluation,
  AiTerritorySummary,
  CollectAiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierSettlementDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, string>;
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, unknown>;
  countAiScoutRevealTiles: (
    to: Tile,
    visibility: AiTerritorySummary["visibility"],
    territorySummary: AiTerritorySummary
  ) => number;
  scoreAiScoutExpandCandidate: (
    actor: Player,
    from: Tile,
    to: Tile,
    visibility?: AiTerritorySummary["visibility"],
    territorySummary?: AiTerritorySummary
  ) => number;
  aiEconomicFrontierSignal: (
    actor: Player,
    tile: Tile,
    visibility?: AiTerritorySummary["visibility"],
    foodPressure?: number,
    territorySummary?: Partial<Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  aiFoodPressureSignal: (actor: Player) => number;
  aiDockStrategicSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Partial<Pick<AiTerritorySummary, "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
  ) => number;
  aiIslandFootprintSignal: (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
  ) => number;
  bestAiIslandFocusTargetId: (
    actor: Player,
    territorySummary: Pick<AiTerritorySummary, "expandCandidates" | "frontierTiles" | "islandProgress" | "islandFocusTargetId">
  ) => number | undefined;
  aiEconomyPriorityState: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ) => { foodCoverageLow: boolean; economyWeak: boolean };
  cachedSupportedTownKeysForTile: (
    actorId: string,
    tileKey: TileKey,
    territorySummary?: Pick<AiTerritorySummary, "supportedTownKeysByTileKey">
  ) => TileKey[];
  collectAiTerritorySummary: CollectAiTerritorySummary;
  townSupport: (tileKey: TileKey, actorId: string) => { supportMax: number; supportCurrent: number };
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  terrainAt: (x: number, y: number) => Tile["terrain"];
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  islandMap: () => { islandIdByTile: Map<TileKey, number> };
  key: (x: number, y: number) => TileKey;
  baseTileValue: (resource: Tile["resource"]) => number;
}

export interface ServerAiFrontierSettlementRuntime {
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
  isAiVisibleEconomicFrontierTile: (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure">
  ) => boolean;
  classifyAiNeutralFrontierOpportunity: (
    actor: Player,
    from: Tile,
    to: Tile,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: Pick<
      AiTerritorySummary,
      "visibility" | "foodPressure" | "settlementEvaluationByKey" | "scoutRevealCountByTileKey" | "scoutRevealMarks" | "scoutRevealStamp" | "islandFootprintSignalByTileKey" | "islandProgress"
    >
  ) => AiNeutralFrontierClass;
  bestAiScaffoldExpand: (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => { from: Tile; to: Tile } | undefined;
  bestAiEconomicExpand: (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: AiTerritorySummary
  ) => { from: Tile; to: Tile } | undefined;
  bestAiIslandExpand: (
    actor: Player,
    territorySummary?: AiTerritorySummary
  ) => { from: Tile; to: Tile } | undefined;
}

export const createServerAiFrontierSettlementRuntime = (
  deps: CreateServerAiFrontierSettlementDeps
): ServerAiFrontierSettlementRuntime => {
  const evaluateAiSettlementCandidate = (
    actor: Player,
    tile: Tile,
    victoryPath?: AiSeasonVictoryPathId,
    assumedFrontierKeys?: ReadonlySet<TileKey>,
    territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure" | "settlementEvaluationByKey" | "islandFootprintSignalByTileKey" | "islandProgress">
  ): AiSettlementCandidateEvaluation => {
    const tk = deps.key(tile.x, tile.y);
    const cacheKey = `${tk}|${victoryPath ?? "none"}|${assumedFrontierKeys ? [...assumedFrontierKeys].sort().join(",") : "-"}`;
    const cached = territorySummary?.settlementEvaluationByKey.get(cacheKey);
    if (cached) return cached;
    const assumedOwned = assumedFrontierKeys?.has(tk) ?? false;
    const actualOwnerId = assumedOwned ? actor.id : deps.ownership.get(tk) ?? tile.ownerId;
    const actualOwnershipState = assumedOwned ? "FRONTIER" : deps.ownershipStateByTile.get(tk) ?? tile.ownershipState;
    if (tile.terrain !== "LAND" || actualOwnerId !== actor.id || actualOwnershipState !== "FRONTIER") {
      const invalidEvaluation: AiSettlementCandidateEvaluation = {
        score: Number.NEGATIVE_INFINITY,
        isEconomicallyInteresting: false,
        isStrategicallyInteresting: false,
        isDefensivelyCompact: false,
        supportsImmediatePlan: false,
        townSupportSignal: 0,
        intrinsicDockValue: 0,
        islandFootprintSignal: 0
      };
      territorySummary?.settlementEvaluationByKey.set(cacheKey, invalidEvaluation);
      return invalidEvaluation;
    }
    const neighborOwnership = (neighbor: RuntimeTileCore): { ownerId: string | undefined; ownershipState: OwnershipState | undefined } => {
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      if (assumedFrontierKeys?.has(neighborKey)) return { ownerId: actor.id, ownershipState: "FRONTIER" };
      return { ownerId: neighbor.ownerId, ownershipState: neighbor.ownershipState };
    };
    const isTown = deps.townsByTile.has(tk);
    const resourceValue = tile.resource ? deps.baseTileValue(tile.resource) : 0;
    const economicFrontierSignal = deps.aiEconomicFrontierSignal(actor, tile, territorySummary?.visibility, territorySummary?.foodPressure, territorySummary);
    const foodPressure = territorySummary?.foodPressure ?? deps.aiFoodPressureSignal(actor);
    const dockValue = deps.docksByTile.has(tk) ? deps.aiDockStrategicSignal(actor, tile, territorySummary) : 0;
    const islandFootprintSignal = deps.aiIslandFootprintSignal(actor, tile, territorySummary);
    let townSupportSignal = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = deps.wrapX(tile.x + dx, deps.WORLD_WIDTH);
        const ny = deps.wrapY(tile.y + dy, deps.WORLD_HEIGHT);
        if (deps.terrainAt(nx, ny) !== "LAND") continue;
        const neighborKey = deps.key(nx, ny);
        if (!deps.townsByTile.has(neighborKey)) continue;
        if (deps.ownership.get(neighborKey) !== actor.id || deps.ownershipStateByTile.get(neighborKey) !== "SETTLED") continue;
        const support = deps.townSupport(neighborKey, actor.id);
        const deficit = Math.max(0, support.supportMax - support.supportCurrent);
        if (deficit > 0) townSupportSignal += 120 + deficit * 36;
      }
    }
    let nearbyOwnedTownCount = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const nx = deps.wrapX(tile.x + dx, deps.WORLD_WIDTH);
        const ny = deps.wrapY(tile.y + dy, deps.WORLD_HEIGHT);
        if (deps.terrainAt(nx, ny) !== "LAND") continue;
        const neighborKey = deps.key(nx, ny);
        if (!deps.townsByTile.has(neighborKey)) continue;
        if (deps.ownership.get(neighborKey) !== actor.id || deps.ownershipStateByTile.get(neighborKey) !== "SETTLED") continue;
        nearbyOwnedTownCount += 1;
      }
    }
    const foodSettlementSignal = foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH") ? Math.round(foodPressure * 0.9) : 0;
    const adjacentInteresting = deps.adjacentNeighborCores(tile.x, tile.y).reduce((score, neighbor) => {
      const neighborKey = deps.key(neighbor.x, neighbor.y);
      const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
      if (deps.townsByTile.has(neighborKey) && hostileOwner) return score + 35;
      if (neighbor.resource && hostileOwner) return score + Math.max(12, deps.baseTileValue(neighbor.resource) / 2);
      if (deps.docksByTile.has(neighborKey) && hostileOwner) return score + 28;
      return score;
    }, 0);
    const exposedSides = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
      const ownership = neighborOwnership(neighbor);
      if (neighbor.terrain !== "LAND") return count + 1;
      if (!ownership.ownerId || ownership.ownerId !== actor.id) return count + 1;
      return count;
    }, 0);
    const ownedNeighbors = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighborOwnership(neighbor).ownerId === actor.id ? 1 : 0), 0);
    const alliedSettledNeighbors = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
      const ownership = neighborOwnership(neighbor);
      return count + (ownership.ownerId === actor.id && ownership.ownershipState === "SETTLED" ? 1 : 0);
    }, 0);
    const alliedFrontierNeighbors = deps.adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
      const ownership = neighborOwnership(neighbor);
      return count + (ownership.ownerId === actor.id && ownership.ownershipState === "FRONTIER" ? 1 : 0);
    }, 0);
    const defensiveShapeValue = alliedSettledNeighbors * 22 + alliedFrontierNeighbors * 10 - exposedSides * 14 + (ownedNeighbors >= 3 ? 24 : 0) + (exposedSides <= 1 ? 18 : 0);
    const connectedCoreValue = alliedSettledNeighbors >= 2 ? 24 : alliedSettledNeighbors >= 1 ? 10 : -10;
    const townConnectionSignal =
      nearbyOwnedTownCount >= 2 ? 110 + alliedSettledNeighbors * 16 : nearbyOwnedTownCount === 1 && alliedSettledNeighbors >= 2 ? 45 : 0;
    const isEconomicallyInteresting =
      isTown ||
      Boolean(tile.resource) ||
      dockValue > 0 ||
      economicFrontierSignal >= 95 ||
      townSupportSignal > 0 ||
      townConnectionSignal >= 90;
    const isDefensivelyCompact = ownedNeighbors >= 3 && exposedSides <= 1;
    const isStrategicallyInteresting = adjacentInteresting >= 35 || defensiveShapeValue >= 26 || townSupportSignal > 0;
    let score = 0;
    if (isTown) score += 140;
    score += resourceValue * 1.5;
    score += foodSettlementSignal + dockValue + economicFrontierSignal;
    score += victoryPath === "SETTLED_TERRITORY" ? islandFootprintSignal : Math.round(islandFootprintSignal * 0.35);
    score += townSupportSignal + adjacentInteresting + defensiveShapeValue + connectedCoreValue;
    score += victoryPath === "ECONOMIC_HEGEMONY" ? townConnectionSignal : Math.round(townConnectionSignal * 0.35);
    if (victoryPath === "SETTLED_TERRITORY") score += 25;
    if (victoryPath === "ECONOMIC_HEGEMONY") score += resourceValue + dockValue + (isTown ? 30 : 0);
    if (!isEconomicallyInteresting && !isStrategicallyInteresting) score -= 120;
    if (ownedNeighbors <= 1 && !isEconomicallyInteresting) score -= 70;
    if (exposedSides >= 3 && !isEconomicallyInteresting && adjacentInteresting < 25) score -= 55;
    const evaluation: AiSettlementCandidateEvaluation = {
      score,
      isEconomicallyInteresting,
      isStrategicallyInteresting,
      isDefensivelyCompact,
      supportsImmediatePlan:
        isEconomicallyInteresting || isDefensivelyCompact || townSupportSignal > 0 || townConnectionSignal >= 70 || score >= (victoryPath === "SETTLED_TERRITORY" ? 36 : 58),
      townSupportSignal,
      intrinsicDockValue: dockValue,
      islandFootprintSignal
    };
    territorySummary?.settlementEvaluationByKey.set(cacheKey, evaluation);
    return evaluation;
  };

  const isAiVisibleEconomicFrontierTile = (
    actor: Player,
    tile: Tile,
    territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure">
  ): boolean => deps.aiEconomicFrontierSignal(actor, tile, territorySummary?.visibility, territorySummary?.foodPressure, territorySummary) >= 95;

  const classifyAiNeutralFrontierOpportunity = (
    actor: Player,
    from: Tile,
    to: Tile,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure" | "settlementEvaluationByKey" | "scoutRevealCountByTileKey" | "scoutRevealMarks" | "scoutRevealStamp" | "islandFootprintSignalByTileKey" | "islandProgress">
  ): AiNeutralFrontierClass => {
    if (isAiVisibleEconomicFrontierTile(actor, to, territorySummary)) return "economic";
    const scaffoldEvaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([deps.key(to.x, to.y)]), territorySummary);
    if (scaffoldEvaluation.supportsImmediatePlan && scaffoldEvaluation.score >= 45) return "scaffold";
    if (deps.scoreAiScoutExpandCandidate(actor, from, to, territorySummary?.visibility, territorySummary as AiTerritorySummary | undefined) >= 30) return "scout";
    return "waste";
  };

  const bestAiScaffoldExpand = (
    actor: Player,
    victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    const { economyWeak, foodCoverageLow } = deps.aiEconomyPriorityState(actor, territorySummary);
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const evaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([deps.key(to.x, to.y)]), territorySummary);
      if (!evaluation.supportsImmediatePlan || ((economyWeak || foodCoverageLow) && !evaluation.isEconomicallyInteresting)) continue;
      let score = evaluation.score;
      if (evaluation.isDefensivelyCompact) score += 30;
      if (evaluation.isEconomicallyInteresting) score += 25;
      if (from.ownershipState === "SETTLED") score += 8;
      if (!best || score > best.score) best = { score, from, to };
    }
    return best && best.score >= 45 ? best : undefined;
  };

  const bestAiEconomicExpand = (
    actor: Player,
    _victoryPath?: AiSeasonVictoryPathId,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId || !isAiVisibleEconomicFrontierTile(actor, to, territorySummary)) continue;
      const score = 260 + deps.aiEconomicFrontierSignal(actor, to, territorySummary.visibility, territorySummary.foodPressure, territorySummary) + (from.ownershipState === "SETTLED" ? 6 : 0);
      if (!best || score > best.score) best = { score, from, to };
    }
    return best;
  };

  const bestAiIslandExpand = (
    actor: Player,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    const focusIslandId = deps.bestAiIslandFocusTargetId(actor, territorySummary);
    const { islandIdByTile } = deps.islandMap();
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const islandId = islandIdByTile.get(deps.key(to.x, to.y));
      if (focusIslandId !== undefined && islandId !== focusIslandId) continue;
      const islandSignal = deps.aiIslandFootprintSignal(actor, to, territorySummary);
      if (islandSignal <= 0) continue;
      const scoutScore = deps.scoreAiScoutExpandCandidate(actor, from, to, territorySummary.visibility, territorySummary);
      const economicSignal = deps.aiEconomicFrontierSignal(actor, to, territorySummary.visibility, territorySummary.foodPressure, territorySummary);
      const score = islandSignal + Math.round(economicSignal * 0.55) + Math.round(scoutScore * 0.45) + 120 + (from.ownershipState === "SETTLED" ? 12 : 0);
      if (!best || score > best.score) best = { score, from, to };
    }
    return best && best.score >= 150 ? best : undefined;
  };

  return {
    evaluateAiSettlementCandidate,
    isAiVisibleEconomicFrontierTile,
    classifyAiNeutralFrontierOpportunity,
    bestAiScaffoldExpand,
    bestAiEconomicExpand,
    bestAiIslandExpand
  };
};
