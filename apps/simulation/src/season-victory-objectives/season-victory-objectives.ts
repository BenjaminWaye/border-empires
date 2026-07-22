import type { SimulationRuntime } from "../runtime/runtime.js";
import { type ResourceType, type SeasonVictoryPathId } from "@border-empires/shared";
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
import type { LeaderboardOverallEntry, SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;
type WorldTile = RuntimeState["tiles"][number];

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

const economicHegemonyDef = VICTORY_PRESSURE_DEFS.find((def) => def.id === "ECONOMIC_HEGEMONY")!;

// Derives the Economic Hegemony objective purely from the leaderboard's live
// incomePerMinute figures — no tile scan required. This is the single source
// of truth: both the full computeSeasonVictory() pass (5-min cadence) and the
// per-tick global-status broadcast (see simulation-service.ts) call this same
// function so the leaderboard's "Overall" income and the Economic Hegemony
// pressure card never disagree for the same player.
export const buildEconomicHegemonyObjective = (
  leaderboardOverall: LeaderboardOverallEntry[]
): SeasonVictoryObjectiveSnapshot => {
  const ranked = leaderboardOverall.slice().sort((a, b) => (b.incomePerMinute - a.incomePerMinute) || a.id.localeCompare(b.id));
  const leader = ranked[0];
  const runnerUp = ranked[1];
  const leaderPlayerId = leader?.id;
  const leaderName = leader?.name ?? "No leader";
  const leaderValue = leader?.incomePerMinute ?? 0;
  const progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${(runnerUp?.incomePerMinute ?? 0).toFixed(1)}`;
  const thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
  const conditionMet = Boolean(
    leaderPlayerId &&
      runnerUp &&
      leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
      runnerUp.incomePerMinute > 0 &&
      leaderValue >= runnerUp.incomePerMinute * SEASON_VICTORY_ECONOMY_LEAD_MULT
  );
  const objective: SeasonVictoryObjectiveSnapshot = {
    id: "ECONOMIC_HEGEMONY",
    name: economicHegemonyDef.name,
    description: economicHegemonyDef.description,
    leaderName,
    progressLabel,
    thresholdLabel,
    holdDurationSeconds: economicHegemonyDef.holdDurationSeconds,
    statusLabel: conditionMet ? "Threshold met" : leaderValue > 0 ? "Pressure building" : "No contender",
    conditionMet
  };
  if (leaderPlayerId) objective.leaderPlayerId = leaderPlayerId;
  return objective;
};

// Live self-progress label for Economic Hegemony, derived the same way as
// buildEconomicHegemonyObjective — no tile scan, always matches the leaderboard.
export const economicHegemonySelfProgressLabel = (
  leaderboardOverall: LeaderboardOverallEntry[],
  playerId: string
): string | undefined => {
  const entry = leaderboardOverall.find((e) => e.id === playerId);
  return entry ? `${entry.incomePerMinute.toFixed(1)} gold/m` : undefined;
};

// Refreshes the ECONOMIC_HEGEMONY entry of an otherwise-cached seasonVictory array
// with the live objective, and refreshes/overrides that one player's self-progress
// label to match — called every global-status broadcast tick so the leaderboard's
// "Overall" income and the Economic Hegemony pressure card never disagree for the
// same player (see performGlobalStatusBroadcast in simulation-service.ts).
export const seasonVictoryForBroadcast = (
  cachedObjectives: SeasonVictoryObjectiveSnapshot[],
  cachedSelfProgressLabels: Map<SeasonVictoryPathId, string> | undefined,
  leaderboardOverall: LeaderboardOverallEntry[],
  playerId: string
): SeasonVictoryObjectiveSnapshot[] => {
  const liveEconomicHegemony = buildEconomicHegemonyObjective(leaderboardOverall);
  const objectives = cachedObjectives.map((objective) =>
    objective.id === "ECONOMIC_HEGEMONY" ? liveEconomicHegemony : objective
  );
  const liveSelfLabel = economicHegemonySelfProgressLabel(leaderboardOverall, playerId);
  const selfProgressLabels =
    liveEconomicHegemony.leaderPlayerId !== playerId && liveSelfLabel
      ? new Map(cachedSelfProgressLabels).set("ECONOMIC_HEGEMONY", liveSelfLabel)
      : cachedSelfProgressLabels;
  return mergeSelfProgress(objectives, selfProgressLabels);
};

type SeasonVictoryContext = {
  competitivePlayerIds: Set<string>;
  playerAlliesById: Map<string, ReadonlySet<string>>;
  metricsByPlayerId: Map<string, VictoryMetrics>;
  totalResourceCounts: Record<ResourceType, number>;
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>;
  townTarget: number;
  maritimeDockTarget: number;
  diplomaticControlTarget: number;
};

// Single O(n_tiles) pass shared by every objective + every player's self-progress
// label below — callers must not re-scan tiles per player (see computeSeasonVictory).
const buildSeasonVictoryContext = (
  worldTiles: WorldTile[],
  leaderboardOverall: LeaderboardOverallEntry[],
  players: RuntimeState["players"]
): SeasonVictoryContext => {
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

  return {
    competitivePlayerIds,
    playerAlliesById,
    metricsByPlayerId,
    totalResourceCounts,
    ownedResourceCountsByPlayerId,
    townTarget,
    maritimeDockTarget,
    diplomaticControlTarget
  };
};

type SeasonVictoryComputation = {
  objectives: SeasonVictoryObjectiveSnapshot[];
  /** Every competitive player's own progress on every objective they don't lead. */
  selfProgressLabelsByPlayerId: Map<string, Map<SeasonVictoryPathId, string>>;
};

// Computes base objectives AND every player's self-progress label from one
// buildSeasonVictoryContext() tile scan. Do not add a second scan elsewhere
// to get per-player labels — merge from selfProgressLabelsByPlayerId instead.
export const computeSeasonVictory = (
  worldTiles: WorldTile[],
  leaderboardOverall: LeaderboardOverallEntry[],
  players: RuntimeState["players"]
): SeasonVictoryComputation => {
  const ctx = buildSeasonVictoryContext(worldTiles, leaderboardOverall, players);

  const objectives = VICTORY_PRESSURE_DEFS.map((def) => {
    if (def.id === "ECONOMIC_HEGEMONY") return buildEconomicHegemonyObjective(leaderboardOverall);

    let leaderPlayerId: string | undefined;
    let leaderName = "No leader";
    let leaderValue = 0;
    let progressLabel = "";
    let thresholdLabel = "";
    let conditionMet = false;

    if (def.id === "TOWN_CONTROL") {
      const ranked = [...ctx.metricsByPlayerId.entries()].sort((a, b) => (b[1].towns - a[1].towns) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].towns ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = `${leaderValue}/${ctx.townTarget} towns`;
      thresholdLabel = `Need ${ctx.townTarget} towns`;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= ctx.townTarget);
    } else if (def.id === "RESOURCE_MONOPOLY") {
      const monopoly = resourceMonopolyLeader(ctx.ownedResourceCountsByPlayerId, ctx.totalResourceCounts);
      leaderPlayerId = monopoly.leaderPlayerId;
      leaderValue = monopoly.bestOwned;
      leaderName = leaderPlayerId ? (ctx.metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = resourceMonopolyProgressLabel(monopoly);
      thresholdLabel = resourceMonopolyThresholdLabel(SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
      conditionMet = resourceMonopolyConditionMet(monopoly, SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
    } else if (def.id === "MARITIME_SUPREMACY") {
      const ranked = [...ctx.metricsByPlayerId.entries()].sort((a, b) => (b[1].dockTiles - a[1].dockTiles) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].dockTiles ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = maritimeSupremacyProgressLabel(leaderValue, ctx.maritimeDockTarget);
      thresholdLabel = maritimeSupremacyThresholdLabel(SEASON_VICTORY_MARITIME_DOCK_SHARE, ctx.maritimeDockTarget);
      conditionMet = Boolean(leaderPlayerId && leaderValue >= ctx.maritimeDockTarget);
    } else {
      const diplomatic = diplomaticDominanceLeader(ctx.metricsByPlayerId, ctx.playerAlliesById, ctx.competitivePlayerIds);
      leaderPlayerId = diplomatic.leaderPlayerId;
      leaderValue = diplomatic.blocControlledTiles;
      leaderName = leaderPlayerId ? (ctx.metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = diplomaticDominanceProgressLabel({
        blocControlledTiles: diplomatic.blocControlledTiles,
        targetTiles: ctx.diplomaticControlTarget,
        leaderControlledTiles: diplomatic.leaderControlledTiles,
        blocMemberCount: diplomatic.blocMemberCount
      });
      thresholdLabel = diplomaticDominanceThresholdLabel(SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE, ctx.diplomaticControlTarget);
      conditionMet = Boolean(leaderPlayerId && diplomatic.blocControlledTiles >= ctx.diplomaticControlTarget);
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
    return objective;
  });

  const selfProgressLabelsByPlayerId = new Map<string, Map<SeasonVictoryPathId, string>>();
  for (const pid of ctx.competitivePlayerIds) {
    const labels = new Map<SeasonVictoryPathId, string>();
    for (const objective of objectives) {
      if (objective.leaderPlayerId === pid) continue;
      const label = objectiveSelfProgressLabel(
        objective.id,
        pid,
        ctx.metricsByPlayerId,
        ctx.townTarget,
        ctx.maritimeDockTarget,
        ctx.diplomaticControlTarget,
        ctx.totalResourceCounts,
        ctx.ownedResourceCountsByPlayerId,
        ctx.playerAlliesById,
        ctx.competitivePlayerIds
      );
      if (label) labels.set(objective.id, label);
    }
    if (labels.size > 0) selfProgressLabelsByPlayerId.set(pid, labels);
  }

  return { objectives, selfProgressLabelsByPlayerId };
};

export const mergeSelfProgress = (
  objectives: SeasonVictoryObjectiveSnapshot[],
  labels: Map<SeasonVictoryPathId, string> | undefined
): SeasonVictoryObjectiveSnapshot[] =>
  labels
    ? objectives.map((o) => {
        const selfProgressLabel = labels.get(o.id);
        return selfProgressLabel ? { ...o, selfProgressLabel } : o;
      })
    : objectives;
