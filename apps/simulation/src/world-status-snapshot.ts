import type { SimulationRuntime } from "./runtime.js";
import { estimateIncomePerMinuteFromTiles } from "./player-runtime-summary.js";
import {
  type ResourceType,
  type SeasonVictoryPathId
} from "@border-empires/shared";
import {
  SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  VICTORY_PRESSURE_DEFS
} from "../../../packages/server/src/server-game-constants.js";
import type { DomainTileState } from "@border-empires/game-domain";
import type {
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  SeasonVictoryObjectiveSnapshot,
  WorldStatusSnapshot
} from "@border-empires/sim-protocol";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

type WorldTile = RuntimeState["tiles"][number];

const RESOURCE_TYPES: ResourceType[] = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR", "OIL"];
const BARBARIAN_PLAYER_ID = "barbarian-1";

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;
const isCompetitivePlayer = (playerId: string): boolean => playerId !== BARBARIAN_PLAYER_ID;
const leaderboardScoreFor = (settledTileCount: number, incomePerMinute: number, techCount: number): number =>
  Math.round((settledTileCount + incomePerMinute * 3 + techCount * 8) * 10) / 10;

const displayNameForPlayer = (playerId: string, fallbackName?: string): string => {
  if (fallbackName && fallbackName !== playerId) return fallbackName;
  if (playerId === "barbarian-1") return "Barbarians";
  if (playerId === "player-1") return "Nauticus";
  if (playerId.startsWith("ai-")) return `AI ${playerId.slice(3)}`;
  return fallbackName ?? playerId;
};

const rankMetric = (entries: Array<{ id: string; name: string; value: number }>): LeaderboardMetricEntry[] =>
  entries
    .slice()
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const buildIslandMap = (tiles: Iterable<WorldTile>): Map<string, number> => {
  const seedTiles = new Map<string, WorldTile>();
  for (const tile of tiles) seedTiles.set(tileKeyOf(tile.x, tile.y), tile);
  const islandByTile = new Map<string, number>();
  let nextIslandId = 1;
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ] as const;

  for (const tile of seedTiles.values()) {
    const key = tileKeyOf(tile.x, tile.y);
    if (tile.terrain !== "LAND" || islandByTile.has(key)) continue;
    const queue: Array<{ x: number; y: number }> = [{ x: tile.x, y: tile.y }];
    islandByTile.set(key, nextIslandId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of neighbors) {
        const neighborKey = tileKeyOf(current.x + dx, current.y + dy);
        if (islandByTile.has(neighborKey)) continue;
        const neighbor = seedTiles.get(neighborKey);
        if (!neighbor || neighbor.terrain !== "LAND") continue;
        islandByTile.set(neighborKey, nextIslandId);
        queue.push({ x: current.x + dx, y: current.y + dy });
      }
    }
    nextIslandId += 1;
  }

  return islandByTile;
};

const objectiveSelfProgressLabel = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, { towns: number; settledTiles: number; incomePerMinute: number; name: string }>,
  townTarget: number,
  settledTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  islandTotals: Map<number, number>,
  settledIslandCountsByPlayerId: Map<string, Map<number, number>>
): string | undefined => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return undefined;
  if (objectiveId === "TOWN_CONTROL") return `${metric.towns}/${townTarget} towns`;
  if (objectiveId === "SETTLED_TERRITORY") return `${metric.settledTiles}/${settledTarget} settled land`;
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
    let bestResource: ResourceType | undefined;
    let bestOwned = 0;
    let bestTotal = 0;
    for (const resource of RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
      if (total <= 0) continue;
      const value = owned[resource] ?? 0;
      if (value > bestOwned) {
        bestOwned = value;
        bestTotal = total;
        bestResource = resource;
      }
    }
    return bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource control";
  }
  const settledByIsland = settledIslandCountsByPlayerId.get(playerId) ?? new Map<number, number>();
  const totalIslands = Math.max(1, islandTotals.size);
  let qualifiedCount = 0;
  let weakestQualifiedRatio = 0;
  let weakestQualifiedOwned = 0;
  let weakestQualifiedTotal = 0;
  for (const [islandId, islandTotal] of islandTotals) {
    if (islandTotal <= 0) continue;
    const owned = settledByIsland.get(islandId) ?? 0;
    const ratio = owned / islandTotal;
    if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
      qualifiedCount += 1;
      if (weakestQualifiedTotal === 0 || ratio < weakestQualifiedRatio) {
        weakestQualifiedRatio = ratio;
        weakestQualifiedOwned = owned;
        weakestQualifiedTotal = islandTotal;
      }
    }
  }
  return qualifiedCount > 0 && weakestQualifiedTotal > 0
    ? `${qualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${Math.round(weakestQualifiedRatio * 100)}% (${weakestQualifiedOwned}/${weakestQualifiedTotal})`
    : `${qualifiedCount}/${totalIslands} islands at 10%+ settled`;
};

const toFallbackWorldTile = (tile: DomainTileState): WorldTile => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
  ...(tile.town?.type ? { townType: tile.town.type } : {}),
  ...(tile.town?.name ? { townName: tile.town.name } : {}),
  ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
  ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
  ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
  ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
  ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
  ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {}),
  ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {})
});

const buildSeasonVictoryObjectives = (
  playerId: string,
  worldTiles: WorldTile[],
  leaderboardOverall: LeaderboardOverallEntry[]
): SeasonVictoryObjectiveSnapshot[] => {
  const competitivePlayerIds = new Set(leaderboardOverall.map((entry) => entry.id));
  const townCountByPlayerId = new Map<string, number>();
  const settledCountByPlayerId = new Map<string, number>();
  const metricsByPlayerId = new Map<string, { towns: number; settledTiles: number; incomePerMinute: number; name: string }>();
  const totalResourceCounts: Record<ResourceType, number> = { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
  const ownedResourceCountsByPlayerId = new Map<string, Record<ResourceType, number>>();
  const islandByTile = buildIslandMap(worldTiles);
  const islandTotals = new Map<number, number>();
  const settledIslandCountsByPlayerId = new Map<string, Map<number, number>>();

  for (const [, islandId] of islandByTile) islandTotals.set(islandId, (islandTotals.get(islandId) ?? 0) + 1);

  for (const tile of worldTiles) {
    const key = tileKeyOf(tile.x, tile.y);
    if (tile.ownerId && tile.townType && competitivePlayerIds.has(tile.ownerId)) {
      townCountByPlayerId.set(tile.ownerId, (townCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && tile.ownershipState === "SETTLED" && competitivePlayerIds.has(tile.ownerId)) {
      settledCountByPlayerId.set(tile.ownerId, (settledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
      const islandId = islandByTile.get(key);
      if (islandId !== undefined) {
        const settledByIsland = settledIslandCountsByPlayerId.get(tile.ownerId) ?? new Map<number, number>();
        settledByIsland.set(islandId, (settledByIsland.get(islandId) ?? 0) + 1);
        settledIslandCountsByPlayerId.set(tile.ownerId, settledByIsland);
      }
    }
    if (tile.resource) {
      const resource = tile.resource as ResourceType;
      totalResourceCounts[resource] += 1;
      if (tile.ownerId && competitivePlayerIds.has(tile.ownerId)) {
        const owned = ownedResourceCountsByPlayerId.get(tile.ownerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
        owned[resource] = (owned[resource] ?? 0) + 1;
        ownedResourceCountsByPlayerId.set(tile.ownerId, owned);
      }
    }
  }

  for (const entry of leaderboardOverall) {
    metricsByPlayerId.set(entry.id, {
      towns: townCountByPlayerId.get(entry.id) ?? 0,
      settledTiles: settledCountByPlayerId.get(entry.id) ?? 0,
      incomePerMinute: entry.incomePerMinute,
      name: entry.name
    });
  }

  const totalTownCount = Math.max(1, worldTiles.filter((tile) => Boolean(tile.townJson || tile.townType || tile.townName)).length);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const totalLandTiles = Math.max(1, worldTiles.filter((tile) => tile.terrain === "LAND").length);
  const settledTarget = Math.max(1, Math.ceil(totalLandTiles * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));

  return VICTORY_PRESSURE_DEFS.map((def) => {
    let leaderPlayerId: string | undefined;
    let leaderName = "No leader";
    let leaderValue = 0;
    let progressLabel = "";
    let thresholdLabel = "";
    let conditionMet = false;

    if (def.id === "TOWN_CONTROL") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].towns - a[1].towns) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].towns ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = `${leaderValue}/${townTarget} towns`;
      thresholdLabel = `Need ${townTarget} towns`;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= townTarget);
    } else if (def.id === "SETTLED_TERRITORY") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].settledTiles - a[1].settledTiles) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].settledTiles ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = `${leaderValue}/${settledTarget} settled land`;
      thresholdLabel = `Need ${settledTarget} settled land tiles`;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= settledTarget);
    } else if (def.id === "ECONOMIC_HEGEMONY") {
      const ranked = leaderboardOverall.slice().sort((a, b) => (b.incomePerMinute - a.incomePerMinute) || a.id.localeCompare(b.id));
      const leader = ranked[0];
      const runnerUp = ranked[1];
      leaderPlayerId = leader?.id;
      leaderName = leader?.name ?? "No leader";
      leaderValue = leader?.incomePerMinute ?? 0;
      progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${(runnerUp?.incomePerMinute ?? 0).toFixed(1)}`;
      thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
      conditionMet = Boolean(
        leaderPlayerId &&
          runnerUp &&
          leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          runnerUp.incomePerMinute > 0 &&
          leaderValue >= runnerUp.incomePerMinute * SEASON_VICTORY_ECONOMY_LEAD_MULT
      );
    } else if (def.id === "RESOURCE_MONOPOLY") {
      let bestResource: ResourceType | undefined;
      let bestOwned = 0;
      let bestTotal = 0;
      for (const [candidatePlayerId, owned] of ownedResourceCountsByPlayerId) {
        for (const resource of RESOURCE_TYPES) {
          const total = totalResourceCounts[resource] ?? 0;
          if (total <= 0) continue;
          const value = owned[resource] ?? 0;
          if (value > bestOwned) {
            leaderPlayerId = candidatePlayerId;
            bestOwned = value;
            bestTotal = total;
            bestResource = resource;
          }
        }
      }
      leaderValue = bestOwned;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource leader";
      thresholdLabel = "Need 100% control of one resource type";
      conditionMet = Boolean(leaderPlayerId && bestResource && bestTotal > 0 && bestOwned >= bestTotal);
    } else {
      const totalIslands = Math.max(1, islandTotals.size);
      let bestQualifiedCount = 0;
      let bestWeakestRatio = -1;
      let bestWeakestOwned = 0;
      let bestWeakestTotal = 0;
      for (const [candidatePlayerId, settledByIsland] of settledIslandCountsByPlayerId) {
        let qualifiedCount = 0;
        let weakestRatio = 0;
        let weakestOwned = 0;
        let weakestTotal = 0;
        for (const [islandId, islandTotal] of islandTotals) {
          if (islandTotal <= 0) continue;
          const owned = settledByIsland.get(islandId) ?? 0;
          const ratio = owned / islandTotal;
          if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
            qualifiedCount += 1;
            if (weakestTotal === 0 || ratio < weakestRatio) {
              weakestRatio = ratio;
              weakestOwned = owned;
              weakestTotal = islandTotal;
            }
          }
        }
        if (
          qualifiedCount > bestQualifiedCount ||
          (qualifiedCount === bestQualifiedCount && (weakestRatio > bestWeakestRatio || (weakestRatio === bestWeakestRatio && candidatePlayerId < (leaderPlayerId ?? "~"))))
        ) {
          leaderPlayerId = candidatePlayerId;
          bestQualifiedCount = qualifiedCount;
          bestWeakestRatio = weakestRatio;
          bestWeakestOwned = weakestOwned;
          bestWeakestTotal = weakestTotal;
        }
      }
      leaderValue = bestQualifiedCount;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel =
        bestQualifiedCount > 0 && bestWeakestTotal > 0
          ? `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${Math.round(bestWeakestRatio * 100)}% (${bestWeakestOwned}/${bestWeakestTotal})`
          : `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled`;
      thresholdLabel = "Need 10% settled land on every island";
      conditionMet = Boolean(leaderPlayerId && bestQualifiedCount >= totalIslands && totalIslands > 0);
    }

    const objective: SeasonVictoryObjectiveSnapshot = {
      id: def.id,
      name: def.name,
      description: def.description,
      leaderName,
      progressLabel,
      thresholdLabel,
      holdDurationSeconds: def.holdDurationSeconds,
      statusLabel: conditionMet ? "Threshold met" : leaderValue > 0 ? "Pressure building" : "No contender",
      conditionMet
    };
    if (leaderPlayerId) objective.leaderPlayerId = leaderPlayerId;
    const selfProgressLabel = objectiveSelfProgressLabel(
      def.id,
      playerId,
      metricsByPlayerId,
      townTarget,
      settledTarget,
      totalResourceCounts,
      ownedResourceCountsByPlayerId,
      islandTotals,
      settledIslandCountsByPlayerId
    );
    if (selfProgressLabel && objective.leaderPlayerId !== playerId) objective.selfProgressLabel = selfProgressLabel;
    return objective;
  });
};

export const buildWorldStatusSnapshot = (
  playerId: string,
  runtimeState: RuntimeState,
  fallbackTiles?: Iterable<DomainTileState>
): WorldStatusSnapshot => {
  const worldTiles = runtimeState.tiles.length > 0 ? runtimeState.tiles : fallbackTiles ? [...fallbackTiles].map((tile) => toFallbackWorldTile(tile)) : [];
  const overall = runtimeState.players
    .filter((player) => isCompetitivePlayer(player.id))
    .map((player) => {
      const settledTileCount =
        typeof player.settledTileCount === "number"
          ? player.settledTileCount
          : worldTiles.filter((tile) => tile.ownerId === player.id && tile.ownershipState === "SETTLED").length;
      const incomePerMinute =
        typeof player.incomePerMinute === "number" ? player.incomePerMinute : estimateIncomePerMinuteFromTiles(player.id, runtimeState.tiles);
      const techCount = player.techIds?.length ?? 0;
      return {
        id: player.id,
        name: displayNameForPlayer(player.id, player.name),
        tiles: settledTileCount,
        incomePerMinute,
        techs: techCount,
        score: leaderboardScoreFor(settledTileCount, incomePerMinute, techCount)
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.tiles - left.tiles ||
        right.incomePerMinute - left.incomePerMinute ||
        right.techs - left.techs ||
        left.name.localeCompare(right.name)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const byTiles = rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.tiles })));
  const byIncome = rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.incomePerMinute })));
  const byTechs = rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.techs })));
  const selfOverall = overall.find((entry) => entry.id === playerId);
  const selfByTiles = byTiles.find((entry) => entry.id === playerId);
  const selfByIncome = byIncome.find((entry) => entry.id === playerId);
  const selfByTechs = byTechs.find((entry) => entry.id === playerId);

  return {
    leaderboard: {
      overall,
      byTiles,
      byIncome,
      byTechs,
      ...(selfOverall ? { selfOverall } : {}),
      ...(selfByTiles ? { selfByTiles } : {}),
      ...(selfByIncome ? { selfByIncome } : {}),
      ...(selfByTechs ? { selfByTechs } : {})
    },
    seasonVictory: buildSeasonVictoryObjectives(playerId, worldTiles, overall)
  };
};
