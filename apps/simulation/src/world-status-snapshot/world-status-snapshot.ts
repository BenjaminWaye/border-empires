import type { SimulationRuntime } from "../runtime/runtime.js";
import { estimateIncomePerMinuteFromTiles } from "../player-runtime-summary.js";
import {
  anonymizedEmpireNameForId,
  isOpaquePlayerId,
  type ResourceType,
  type SeasonVictoryPathId
} from "@border-empires/shared";
import {
  SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_MARITIME_DOCK_SHARE,
  SEASON_VICTORY_MARITIME_MIN_DOCKS,
  SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  VICTORY_PRESSURE_DEFS,
  VICTORY_RESOURCE_TYPES,
  diplomaticDominanceProgressLabel,
  diplomaticDominanceThresholdLabel,
  maritimeSupremacyProgressLabel,
  maritimeSupremacyThresholdLabel,
  resourceMonopolyConditionMet,
  resourceMonopolyLeader,
  resourceMonopolyProgressLabel,
  resourceMonopolyThresholdLabel
} from "@border-empires/game-domain";
import type { DomainTileState } from "@border-empires/game-domain";
import type {
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  SeasonVictoryObjectiveSnapshot,
  WorldStatusSnapshot
} from "@border-empires/sim-protocol";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

type WorldTile = RuntimeState["tiles"][number];

const BARBARIAN_PLAYER_ID = "barbarian-1";

const isCompetitivePlayer = (playerId: string, excludedIds?: ReadonlySet<string>): boolean =>
  playerId !== BARBARIAN_PLAYER_ID && !(excludedIds?.has(playerId) ?? false);
const leaderboardScoreFor = (settledTileCount: number, incomePerMinute: number, techCount: number): number =>
  Math.round((settledTileCount + incomePerMinute * 3 + techCount * 8) * 10) / 10;

const displayNameForPlayer = (playerId: string, fallbackName?: string): string => {
  if (fallbackName && fallbackName !== playerId) return fallbackName;
  if (playerId === "barbarian-1") return "Barbarians";
  if (playerId === "player-1") return "Nauticus";
  if (playerId.startsWith("ai-")) return `AI ${playerId.slice(3)}`;
  if (isOpaquePlayerId(playerId)) return anonymizedEmpireNameForId(playerId);
  return fallbackName ?? playerId;
};

const rankMetric = (entries: Array<{ id: string; name: string; value: number }>): LeaderboardMetricEntry[] =>
  entries
    .slice()
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

type VictoryMetrics = {
  towns: number;
  settledTiles: number;
  controlledTiles: number;
  dockTiles: number;
  incomePerMinute: number;
  name: string;
};

const allianceBlocForPlayer = (
  playerId: string,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): Set<string> => {
  const bloc = new Set<string>([playerId]);
  const queue = [playerId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const allyId of playerAlliesById.get(current) ?? []) {
      if (!competitivePlayerIds.has(allyId) || bloc.has(allyId)) continue;
      if (!(playerAlliesById.get(allyId)?.has(current) ?? false)) continue;
      bloc.add(allyId);
      queue.push(allyId);
    }
  }
  return bloc;
};

const diplomaticDominanceLeader = (
  metricsByPlayerId: ReadonlyMap<string, VictoryMetrics>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): { leaderPlayerId?: string; blocControlledTiles: number; leaderControlledTiles: number; blocMemberCount: number } => {
  let bestLeaderPlayerId: string | undefined;
  let bestBlocControlledTiles = 0;
  let bestLeaderControlledTiles = 0;
  let bestBlocMemberCount = 0;
  const seenBlocKeys = new Set<string>();
  for (const candidatePlayerId of competitivePlayerIds) {
    const bloc = allianceBlocForPlayer(candidatePlayerId, playerAlliesById, competitivePlayerIds);
    const members = [...bloc];
    const blocKey = members.sort().join("|");
    if (seenBlocKeys.has(blocKey)) continue;
    seenBlocKeys.add(blocKey);
    const blocControlledTiles = members.reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
    let leaderPlayerId: string | undefined;
    let leaderControlledTiles = -1;
    let tiedLargest = false;
    for (const memberId of members) {
      const controlledTiles = metricsByPlayerId.get(memberId)?.controlledTiles ?? 0;
      if (controlledTiles > leaderControlledTiles) {
        leaderPlayerId = memberId;
        leaderControlledTiles = controlledTiles;
        tiedLargest = false;
      } else if (controlledTiles === leaderControlledTiles) {
        tiedLargest = true;
      }
    }
    if (!leaderPlayerId || tiedLargest) continue;
    if (
      blocControlledTiles > bestBlocControlledTiles ||
      (
        blocControlledTiles === bestBlocControlledTiles &&
        (leaderControlledTiles > bestLeaderControlledTiles || (leaderControlledTiles === bestLeaderControlledTiles && leaderPlayerId < (bestLeaderPlayerId ?? "~")))
      )
    ) {
      bestLeaderPlayerId = leaderPlayerId;
      bestBlocControlledTiles = blocControlledTiles;
      bestLeaderControlledTiles = leaderControlledTiles;
      bestBlocMemberCount = members.length;
    }
  }
  return {
    ...(bestLeaderPlayerId ? { leaderPlayerId: bestLeaderPlayerId } : {}),
    blocControlledTiles: bestBlocControlledTiles,
    leaderControlledTiles: bestLeaderControlledTiles,
    blocMemberCount: bestBlocMemberCount
  };
};

const objectiveSelfProgressLabel = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, VictoryMetrics>,
  townTarget: number,
  maritimeDockTarget: number,
  diplomaticControlTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): string | undefined => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return undefined;
  if (objectiveId === "TOWN_CONTROL") return `${metric.towns}/${townTarget} towns`;
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
    let bestResource: ResourceType | undefined;
    let bestOwned = 0;
    let bestTotal = 0;
    for (const resource of VICTORY_RESOURCE_TYPES) {
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
  if (objectiveId === "MARITIME_SUPREMACY") return `${metric.dockTiles}/${maritimeDockTarget} docks`;
  const bloc = allianceBlocForPlayer(playerId, playerAlliesById, competitivePlayerIds);
  const blocControlledTiles = [...bloc].reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
  return `${blocControlledTiles}/${diplomaticControlTarget} alliance-controlled land`;
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
  leaderboardOverall: LeaderboardOverallEntry[],
  players: RuntimeState["players"]
): SeasonVictoryObjectiveSnapshot[] => {
  const competitivePlayerIds = new Set(leaderboardOverall.map((entry) => entry.id));
  const playerAlliesById = new Map<string, ReadonlySet<string>>();
  for (const player of players) {
    if (!competitivePlayerIds.has(player.id)) continue;
    playerAlliesById.set(player.id, new Set(player.allies ?? []));
  }
  const townCountByPlayerId = new Map<string, number>();
  const settledCountByPlayerId = new Map<string, number>();
  const controlledCountByPlayerId = new Map<string, number>();
  const dockCountByPlayerId = new Map<string, number>();
  const metricsByPlayerId = new Map<string, VictoryMetrics>();
  const totalResourceCounts: Record<ResourceType, number> = { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
  const ownedResourceCountsByPlayerId = new Map<string, Record<ResourceType, number>>();

  for (const tile of worldTiles) {
    if (tile.ownerId && tile.ownershipState === "SETTLED" && tile.townType && competitivePlayerIds.has(tile.ownerId)) {
      townCountByPlayerId.set(tile.ownerId, (townCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (
      tile.ownerId &&
      (tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER") &&
      competitivePlayerIds.has(tile.ownerId)
    ) {
      controlledCountByPlayerId.set(tile.ownerId, (controlledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && tile.ownershipState === "SETTLED" && competitivePlayerIds.has(tile.ownerId)) {
      settledCountByPlayerId.set(tile.ownerId, (settledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
      if (tile.dockId) dockCountByPlayerId.set(tile.ownerId, (dockCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.resource) {
      const resource = tile.resource as ResourceType;
      totalResourceCounts[resource] += 1;
      if (tile.ownerId && competitivePlayerIds.has(tile.ownerId)) {
        const owned = ownedResourceCountsByPlayerId.get(tile.ownerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
        owned[resource] = (owned[resource] ?? 0) + 1;
        ownedResourceCountsByPlayerId.set(tile.ownerId, owned);
      }
    }
  }

  for (const entry of leaderboardOverall) {
    metricsByPlayerId.set(entry.id, {
      towns: townCountByPlayerId.get(entry.id) ?? 0,
      settledTiles: settledCountByPlayerId.get(entry.id) ?? 0,
      controlledTiles: controlledCountByPlayerId.get(entry.id) ?? 0,
      dockTiles: dockCountByPlayerId.get(entry.id) ?? 0,
      incomePerMinute: entry.incomePerMinute,
      name: entry.name
    });
  }

  const totalTownCount = Math.max(1, worldTiles.filter((tile) => Boolean(tile.townJson || tile.townType || tile.townName)).length);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const totalLandTiles = Math.max(1, worldTiles.filter((tile) => tile.terrain === "LAND").length);
  const totalDocks = Math.max(1, worldTiles.filter((tile) => Boolean(tile.dockId)).length);
  const maritimeDockTarget = Math.max(SEASON_VICTORY_MARITIME_MIN_DOCKS, Math.ceil(totalDocks * SEASON_VICTORY_MARITIME_DOCK_SHARE));
  const diplomaticControlTarget = Math.max(1, Math.ceil(totalLandTiles * SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE));

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
      const monopoly = resourceMonopolyLeader(ownedResourceCountsByPlayerId, totalResourceCounts);
      leaderPlayerId = monopoly.leaderPlayerId;
      leaderValue = monopoly.bestOwned;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = resourceMonopolyProgressLabel(monopoly);
      thresholdLabel = resourceMonopolyThresholdLabel(SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
      conditionMet = resourceMonopolyConditionMet(monopoly, SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
    } else if (def.id === "MARITIME_SUPREMACY") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].dockTiles - a[1].dockTiles) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].dockTiles ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = maritimeSupremacyProgressLabel(leaderValue, maritimeDockTarget);
      thresholdLabel = maritimeSupremacyThresholdLabel(SEASON_VICTORY_MARITIME_DOCK_SHARE, maritimeDockTarget);
      conditionMet = Boolean(leaderPlayerId && leaderValue >= maritimeDockTarget);
    } else {
      const diplomatic = diplomaticDominanceLeader(metricsByPlayerId, playerAlliesById, competitivePlayerIds);
      leaderPlayerId = diplomatic.leaderPlayerId;
      leaderValue = diplomatic.blocControlledTiles;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = diplomaticDominanceProgressLabel({
        blocControlledTiles: diplomatic.blocControlledTiles,
        targetTiles: diplomaticControlTarget,
        leaderControlledTiles: diplomatic.leaderControlledTiles,
        blocMemberCount: diplomatic.blocMemberCount
      });
      thresholdLabel = diplomaticDominanceThresholdLabel(SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE, diplomaticControlTarget);
      conditionMet = Boolean(leaderPlayerId && diplomatic.blocControlledTiles >= diplomaticControlTarget);
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
      maritimeDockTarget,
      diplomaticControlTarget,
      totalResourceCounts,
      ownedResourceCountsByPlayerId,
      playerAlliesById,
      competitivePlayerIds
    );
    if (selfProgressLabel && objective.leaderPlayerId !== playerId) objective.selfProgressLabel = selfProgressLabel;
    return objective;
  });
};

export const buildWorldStatusSnapshot = (
  playerId: string,
  runtimeState: RuntimeState,
  fallbackTiles?: Iterable<DomainTileState>,
  options?: { acceptLatencyP95Ms?: number; nonCompetitivePlayerIds?: ReadonlySet<string> }
): WorldStatusSnapshot => {
  const worldTiles = runtimeState.tiles.length > 0 ? runtimeState.tiles : fallbackTiles ? [...fallbackTiles].map((tile) => toFallbackWorldTile(tile)) : [];
  const overall = runtimeState.players
    .filter((player) => isCompetitivePlayer(player.id, options?.nonCompetitivePlayerIds))
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
    seasonVictory: buildSeasonVictoryObjectives(playerId, worldTiles, overall, runtimeState.players),
    ...(typeof options?.acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms: options.acceptLatencyP95Ms } : {})
  };
};

/**
 * Cheap O(n_players) leaderboard build with no tile iteration.
 * Phase 3b: used by the global-status broadcast so it no longer needs
 * the full exportStateAsync (O(202k-tile)) on every cycle.
 * Season-victory objectives are NOT computed here — callers should use
 * the cached currentSummary.seasonVictory via personalizeSeasonVictoryObjectives.
 */
export const buildLeaderboardFromPlayers = (
  players: RuntimeState["players"],
  nonCompetitivePlayerIds?: ReadonlySet<string>
): WorldStatusSnapshot["leaderboard"] => {
  const overall = players
    .filter((player) => isCompetitivePlayer(player.id, nonCompetitivePlayerIds))
    .map((player) => {
      const settledTileCount = player.settledTileCount ?? 0;
      const incomePerMinute = player.incomePerMinute ?? 0;
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
      (l, r) =>
        r.score - l.score || r.tiles - l.tiles || r.incomePerMinute - l.incomePerMinute ||
        r.techs - l.techs || l.name.localeCompare(r.name)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const byTiles = rankMetric(overall.map((e) => ({ id: e.id, name: e.name, value: e.tiles })));
  const byIncome = rankMetric(overall.map((e) => ({ id: e.id, name: e.name, value: e.incomePerMinute })));
  const byTechs = rankMetric(overall.map((e) => ({ id: e.id, name: e.name, value: e.techs })));
  return { overall, byTiles, byIncome, byTechs };
};