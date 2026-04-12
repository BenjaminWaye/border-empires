import type { LandBiome, Player, Tile, TileKey } from "@border-empires/shared";
import type { ClusterDefinition, RuntimeTileCore } from "./server-shared-types.js";
import type {
  AiEconomyPriorityState,
  AiScoutAdjacencyMetrics,
  AiTerritorySummary,
  CollectAiTerritorySummary
} from "./server-ai-frontier-types.js";

export interface CreateServerAiFrontierScoutDeps {
  AI_FRONTIER_SELECTOR_BUDGET_MS: number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  now: () => number;
  key: (x: number, y: number) => TileKey;
  tileIndex: (x: number, y: number) => number;
  visibleInSnapshot: (snapshot: AiTerritorySummary["visibility"], x: number, y: number) => boolean;
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  terrainAt: (x: number, y: number) => Tile["terrain"];
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, unknown>;
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  clusterResourceType: (cluster: ClusterDefinition) => Tile["resource"] | undefined;
  landBiomeAt: (x: number, y: number) => LandBiome | undefined;
  grassShadeAt: (x: number, y: number) => "LIGHT" | "DARK" | undefined;
  isNearMountain: (x: number, y: number, distance: number) => boolean;
  aiEconomyPriorityState: (
    actor: Player,
    territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
  ) => AiEconomyPriorityState;
  collectAiTerritorySummary: CollectAiTerritorySummary;
  appLogWarn: (payload: Record<string, unknown>, message: string) => void;
  baseTileValue: (resource: Tile["resource"]) => number;
}

export interface ServerAiFrontierScoutRuntime {
  countAiScoutRevealTiles: (
    to: Tile,
    visibility: AiTerritorySummary["visibility"],
    territorySummary: AiTerritorySummary
  ) => number;
  cachedScoutAdjacencyMetrics: (
    actor: Player,
    to: Tile,
    territorySummary: AiTerritorySummary
  ) => AiScoutAdjacencyMetrics;
  scoreAiScoutRevealValue: (
    actor: Player,
    to: Tile,
    visibility: AiTerritorySummary["visibility"],
    territorySummary: AiTerritorySummary
  ) => number;
  bestAiOpeningScoutExpand: (actor: Player, territorySummary?: AiTerritorySummary) => { from: Tile; to: Tile } | undefined;
  scoreAiScoutExpandCandidate: (
    actor: Player,
    from: Tile,
    to: Tile,
    visibility?: AiTerritorySummary["visibility"],
    territorySummary?: AiTerritorySummary
  ) => number;
  bestAiScoutExpand: (actor: Player, territorySummary?: AiTerritorySummary) => { from: Tile; to: Tile } | undefined;
}

export const createServerAiFrontierScoutRuntime = (
  deps: CreateServerAiFrontierScoutDeps
): ServerAiFrontierScoutRuntime => {
  const countAiScoutRevealTiles = (
    to: Tile,
    visibility: AiTerritorySummary["visibility"],
    territorySummary: AiTerritorySummary
  ): number => {
    const tk = deps.key(to.x, to.y);
    const cached = territorySummary.scoutRevealCountByTileKey.get(tk);
    if (cached !== undefined) return cached;
    territorySummary.scoutRevealStamp += 1;
    if (territorySummary.scoutRevealStamp === 0) {
      territorySummary.scoutRevealMarks.fill(0);
      territorySummary.scoutRevealStamp = 1;
    }
    const stamp = territorySummary.scoutRevealStamp;
    let count = 0;
    for (const next of deps.adjacentNeighborCores(to.x, to.y)) {
      if (next.terrain !== "LAND") continue;
      const firstIndex = deps.tileIndex(next.x, next.y);
      if (!deps.visibleInSnapshot(visibility, next.x, next.y) && territorySummary.scoutRevealMarks[firstIndex] !== stamp) {
        territorySummary.scoutRevealMarks[firstIndex] = stamp;
        count += 1;
      }
      for (const secondRing of deps.adjacentNeighborCores(next.x, next.y)) {
        if (secondRing.terrain !== "LAND") continue;
        const secondIndex = deps.tileIndex(secondRing.x, secondRing.y);
        if (!deps.visibleInSnapshot(visibility, secondRing.x, secondRing.y) && territorySummary.scoutRevealMarks[secondIndex] !== stamp) {
          territorySummary.scoutRevealMarks[secondIndex] = stamp;
          count += 1;
        }
      }
    }
    territorySummary.scoutRevealCountByTileKey.set(tk, count);
    return count;
  };

  const cachedScoutAdjacencyMetrics = (actor: Player, to: Tile, territorySummary: AiTerritorySummary): AiScoutAdjacencyMetrics => {
    const tk = deps.key(to.x, to.y);
    const cached = territorySummary.scoutAdjacencyByTileKey.get(tk);
    if (cached) return cached;
    let ownedNeighbors = 0;
    let alliedSettledNeighbors = 0;
    let frontierNeighbors = 0;
    let coastlineDiscoveryValue = 0;
    let exposedSides = 0;
    for (const next of deps.adjacentNeighborCores(to.x, to.y)) {
      if (next.ownerId === actor.id) {
        ownedNeighbors += 1;
        if (next.ownershipState === "SETTLED") alliedSettledNeighbors += 1;
        if (next.ownershipState === "FRONTIER") frontierNeighbors += 1;
      }
      if (next.terrain === "SEA") coastlineDiscoveryValue += 18;
      if (next.terrain !== "LAND" || next.ownerId !== actor.id) exposedSides += 1;
    }
    const metrics = { ownedNeighbors, alliedSettledNeighbors, frontierNeighbors, coastlineDiscoveryValue, exposedSides };
    territorySummary.scoutAdjacencyByTileKey.set(tk, metrics);
    return metrics;
  };

  const scoreAiScoutRevealValue = (
    actor: Player,
    to: Tile,
    visibility: AiTerritorySummary["visibility"],
    territorySummary: AiTerritorySummary
  ): number => {
    const tk = deps.key(to.x, to.y);
    const { economyWeak } = deps.aiEconomyPriorityState(actor, territorySummary);
    const profileKey = `${territorySummary.foodPressure > 0 ? 1 : 0}:${economyWeak ? 1 : 0}:${tk}`;
    const cached = territorySummary.scoutRevealValueByProfileKey.get(profileKey);
    if (cached !== undefined) return cached;
    territorySummary.scoutRevealStamp += 1;
    if (territorySummary.scoutRevealStamp === 0) {
      territorySummary.scoutRevealMarks.fill(0);
      territorySummary.scoutRevealStamp = 1;
    }
    const stamp = territorySummary.scoutRevealStamp;
    const foodPressure = territorySummary.foodPressure;
    let score = 0;
    const considerReveal = (x: number, y: number): void => {
      const revealIndex = deps.tileIndex(x, y);
      if (territorySummary.scoutRevealMarks[revealIndex] === stamp) return;
      territorySummary.scoutRevealMarks[revealIndex] = stamp;
      if (deps.visibleInSnapshot(visibility, x, y) || deps.terrainAt(x, y) !== "LAND") return;
      const revealKey = deps.key(x, y);
      score += 4;
      if (deps.townsByTile.has(revealKey)) {
        score += 90;
        return;
      }
      if (deps.docksByTile.has(revealKey)) {
        score += 85;
        return;
      }
      const clusterId = deps.clusterByTile.get(revealKey);
      const cluster = clusterId ? deps.clustersById.get(clusterId) : undefined;
      if (cluster) {
        const resource = deps.clusterResourceType(cluster);
        score += 50 + Math.round(deps.baseTileValue(resource) * 0.7);
        if (foodPressure > 0 && (resource === "FARM" || resource === "FISH")) score += 60;
        return;
      }
      const biome = deps.landBiomeAt(x, y);
      const shade = deps.grassShadeAt(x, y);
      if (biome === "COASTAL_SAND") {
        score += foodPressure > 0 ? 26 : 14;
        score += 12;
      } else if (biome === "GRASS") {
        score += shade === "LIGHT" ? (foodPressure > 0 ? 22 : 12) : 8;
      } else if (biome === "SAND") {
        score += economyWeak ? 12 : 8;
      }
      if (deps.isNearMountain(x, y, 2)) score += 8;
      if (deps.adjacentNeighborCores(x, y).some((neighbor) => neighbor.terrain === "SEA")) score += 8;
    };
    for (const next of deps.adjacentNeighborCores(to.x, to.y)) {
      if (next.terrain !== "LAND") continue;
      considerReveal(next.x, next.y);
      for (const secondRing of deps.adjacentNeighborCores(next.x, next.y)) {
        if (secondRing.terrain !== "LAND") continue;
        considerReveal(secondRing.x, secondRing.y);
      }
    }
    territorySummary.scoutRevealValueByProfileKey.set(profileKey, score);
    return score;
  };

  const bestAiOpeningScoutExpand = (
    actor: Player,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    if (territorySummary.settledTileCount > 2) return undefined;
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const unseenNeighbors = countAiScoutRevealTiles(to, territorySummary.visibility, territorySummary);
      const revealValue = scoreAiScoutRevealValue(actor, to, territorySummary.visibility, territorySummary);
      const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);
      const score =
        unseenNeighbors * 22 +
        revealValue +
        adjacency.coastlineDiscoveryValue +
        (adjacency.ownedNeighbors <= 2 ? 16 : 0) +
        (from.ownershipState === "FRONTIER" ? 10 : 0) -
        Math.max(0, adjacency.ownedNeighbors - 2) * 34 -
        Math.max(0, adjacency.alliedSettledNeighbors - 1) * 20 -
        Math.max(0, adjacency.frontierNeighbors - 1) * 12 -
        adjacency.exposedSides * 4;
      if (!best || score > best.score) best = { score, from, to };
    }
    return best;
  };

  const scoreAiScoutExpandCandidate = (
    actor: Player,
    from: Tile,
    to: Tile,
    visibility = deps.collectAiTerritorySummary(actor).visibility,
    territorySummary?: AiTerritorySummary
  ): number => {
    const unseenNeighbors = territorySummary
      ? countAiScoutRevealTiles(to, visibility, territorySummary)
      : (() => {
          const scoutRevealTiles = new Set<TileKey>();
          for (const next of deps.adjacentNeighborCores(to.x, to.y)) {
            if (next.terrain !== "LAND") continue;
            if (!deps.visibleInSnapshot(visibility, next.x, next.y)) scoutRevealTiles.add(deps.key(next.x, next.y));
            for (const secondRing of deps.adjacentNeighborCores(next.x, next.y)) {
              if (secondRing.terrain !== "LAND") continue;
              if (!deps.visibleInSnapshot(visibility, secondRing.x, secondRing.y)) scoutRevealTiles.add(deps.key(secondRing.x, secondRing.y));
            }
          }
          return scoutRevealTiles.size;
        })();
    const adjacency = territorySummary
      ? cachedScoutAdjacencyMetrics(actor, to, territorySummary)
      : (() => {
          let ownedNeighbors = 0;
          let alliedSettledNeighbors = 0;
          let frontierNeighbors = 0;
          let coastlineDiscoveryValue = 0;
          for (const next of deps.adjacentNeighborCores(to.x, to.y)) {
            if (next.ownerId === actor.id) {
              ownedNeighbors += 1;
              if (next.ownershipState === "SETTLED") alliedSettledNeighbors += 1;
              if (next.ownershipState === "FRONTIER") frontierNeighbors += 1;
            }
            if (next.terrain === "SEA") coastlineDiscoveryValue += 18;
          }
          return { ownedNeighbors, alliedSettledNeighbors, frontierNeighbors, coastlineDiscoveryValue };
        })();
    const revealValue = territorySummary ? scoreAiScoutRevealValue(actor, to, visibility, territorySummary) : 0;
    return (
      unseenNeighbors * 18 +
      revealValue +
      adjacency.coastlineDiscoveryValue +
      (adjacency.ownedNeighbors <= 2 ? 16 : 0) +
      (from.ownershipState === "FRONTIER" ? 10 : 0) -
      Math.max(0, adjacency.ownedNeighbors - 2) * 34 -
      Math.max(0, adjacency.alliedSettledNeighbors - 1) * 20 -
      Math.max(0, adjacency.frontierNeighbors - 1) * 12
    );
  };

  const bestAiScoutExpand = (
    actor: Player,
    territorySummary = deps.collectAiTerritorySummary(actor)
  ): { from: Tile; to: Tile } | undefined => {
    const startedAt = deps.now();
    let scannedCandidates = 0;
    let best: { score: number; from: Tile; to: Tile } | undefined;
    for (const { from, to } of territorySummary.expandCandidates) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      scannedCandidates += 1;
      const scoutRevealCount = countAiScoutRevealTiles(to, territorySummary.visibility, territorySummary);
      const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);
      if (scoutRevealCount <= 0 && adjacency.coastlineDiscoveryValue <= 0) {
        if ((scannedCandidates & 3) === 0 && deps.now() - startedAt >= deps.AI_FRONTIER_SELECTOR_BUDGET_MS) {
          deps.appLogWarn({ playerId: actor.id, scannedCandidates, frontierCandidates: territorySummary.expandCandidates.length, elapsedMs: deps.now() - startedAt, budgetMs: deps.AI_FRONTIER_SELECTOR_BUDGET_MS }, "ai frontier selector budget hit");
          break;
        }
        continue;
      }
      const revealValue = scoreAiScoutRevealValue(actor, to, territorySummary.visibility, territorySummary);
      const score =
        scoutRevealCount * 18 +
        revealValue +
        adjacency.coastlineDiscoveryValue +
        (adjacency.ownedNeighbors <= 2 ? 16 : 0) +
        (from.ownershipState === "FRONTIER" ? 10 : 0) -
        Math.max(0, adjacency.ownedNeighbors - 2) * 34 -
        Math.max(0, adjacency.alliedSettledNeighbors - 1) * 20 -
        Math.max(0, adjacency.frontierNeighbors - 1) * 12;
      if (!best || score > best.score) best = { score, from, to };
      if ((scannedCandidates & 31) === 0 && deps.now() - startedAt >= deps.AI_FRONTIER_SELECTOR_BUDGET_MS) {
        deps.appLogWarn({ playerId: actor.id, scannedCandidates, frontierCandidates: territorySummary.expandCandidates.length, elapsedMs: deps.now() - startedAt, budgetMs: deps.AI_FRONTIER_SELECTOR_BUDGET_MS }, "ai frontier selector budget hit");
        break;
      }
    }
    return best && best.score >= 30 ? best : undefined;
  };

  return {
    countAiScoutRevealTiles,
    cachedScoutAdjacencyMetrics,
    scoreAiScoutRevealValue,
    bestAiOpeningScoutExpand,
    scoreAiScoutExpandCandidate,
    bestAiScoutExpand
  };
};
