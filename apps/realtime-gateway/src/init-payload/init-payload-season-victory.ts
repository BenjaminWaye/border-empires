// Login-time season-victory fallback, split out of init-payload.ts to keep that
// file under the repo's 500-line cap. buildGatewayInitPayload uses this only
// when no live world-status broadcast has arrived yet; it mirrors the
// simulation's computeSeasonVictory (apps/simulation/src/season-victory-objectives/).

import type { ResourceType, SeasonVictoryObjectiveView, SeasonVictoryPathId } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
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
  type VictoryPressureDefinition,
  createVictoryResourceTally,
  diplomaticDominanceProgressLabel,
  diplomaticDominanceThresholdLabel,
  maritimeSupremacyProgressLabel,
  maritimeSupremacyThresholdLabel,
  resourceMonopolyConditionMet,
  resourceMonopolyLeader,
  resourceMonopolyProgressLabel,
  resourceMonopolyThresholdLabel,
  tallyVictoryResourceTile
} from "@border-empires/game-domain";
import type { LegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";

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
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${(metric.incomePerMinute * 1440).toFixed(1)} coin/day`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, TITANIUM: 0, GEMS: 0, FISH: 0, UMBRITE: 0 };
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

export const buildSeasonVictoryObjectives = (
  playerId: string,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined,
  initialState: PlayerSubscriptionSnapshot | undefined,
  leaderboardOverall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number }>,
  revealCategoryForTech: (techId: string) => string | undefined
): SeasonVictoryObjectiveView[] => {
  if (!snapshotBootstrap || !initialState) return [];
  const worldTiles = snapshotBootstrap.initialState.tiles;
  const competitivePlayerIds = new Set(leaderboardOverall.map((entry) => entry.id));
  const playerAlliesById = new Map<string, ReadonlySet<string>>();
  const techIdsByPlayerId = new Map<string, ReadonlySet<string>>();
  for (const playerId of competitivePlayerIds) {
    const player = snapshotBootstrap.players.get(playerId);
    playerAlliesById.set(playerId, new Set(player?.allies ?? []));
    techIdsByPlayerId.set(playerId, player?.techIds ?? new Set());
  }
  const townCountByPlayerId = new Map<string, number>();
  const settledCountByPlayerId = new Map<string, number>();
  const controlledCountByPlayerId = new Map<string, number>();
  const dockCountByPlayerId = new Map<string, number>();
  const metricsByPlayerId = new Map<string, VictoryMetrics>();
  const resourceTally = createVictoryResourceTally();
  for (const tile of worldTiles) {
    if (tile.ownerId && tile.town?.type && competitivePlayerIds.has(tile.ownerId)) {
      townCountByPlayerId.set(tile.ownerId, (townCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && competitivePlayerIds.has(tile.ownerId) && (tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER")) {
      controlledCountByPlayerId.set(tile.ownerId, (controlledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && competitivePlayerIds.has(tile.ownerId) && tile.ownershipState === "SETTLED") {
      settledCountByPlayerId.set(tile.ownerId, (settledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
      if (tile.dockId) dockCountByPlayerId.set(tile.ownerId, (dockCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    // Same settled + revealed rule as the simulation's computeSeasonVictory.
    tallyVictoryResourceTile(resourceTally, tile, tile.ownerId ? techIdsByPlayerId.get(tile.ownerId) : undefined, revealCategoryForTech);
  }
  const { totalResourceCounts, ownedResourceCountsByPlayerId } = resourceTally;
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
  const totalTownCount = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => Boolean(tile.town)).length);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const totalLandTiles = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => tile.terrain === "LAND").length);
  const totalDocks = Math.max(1, worldTiles.filter((tile) => Boolean(tile.dockId)).length);
  const maritimeDockTarget = Math.max(SEASON_VICTORY_MARITIME_MIN_DOCKS, Math.ceil(totalDocks * SEASON_VICTORY_MARITIME_DOCK_SHARE));
  const diplomaticControlTarget = Math.max(1, Math.ceil(totalLandTiles * SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE));
  const trackers = new Map(snapshotBootstrap.seasonVictory ?? []);
  return VICTORY_PRESSURE_DEFS.map((def: VictoryPressureDefinition) => {
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
      progressLabel = `${(leaderValue * 1440).toFixed(1)} coin/day vs ${((runnerUp?.incomePerMinute ?? 0) * 1440).toFixed(1)}`;
      thresholdLabel = `Need at least 1000 coin/day and 33% lead`;
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
    const tracker = trackers.get(def.id);
    const holdRemainingSeconds =
      !snapshotBootstrap.seasonWinner &&
      conditionMet &&
      tracker?.leaderPlayerId === leaderPlayerId &&
      typeof tracker?.holdStartedAt === "number"
        ? Math.max(0, Math.ceil((tracker.holdStartedAt + def.holdDurationSeconds * 1000 - Date.now()) / 1000))
        : undefined;
    const statusLabel = snapshotBootstrap.seasonWinner
      ? snapshotBootstrap.seasonWinner.objectiveId === def.id
        ? `Winner crowned: ${snapshotBootstrap.seasonWinner.playerName}`
        : "Season already decided"
      : conditionMet
        ? holdRemainingSeconds !== undefined
          ? `Holding · ${Math.max(0, Math.ceil(holdRemainingSeconds / 3600))}h left`
          : "Threshold met"
        : leaderValue > 0
          ? "Pressure building"
          : "No contender";
    const objective: SeasonVictoryObjectiveView = {
      id: def.id,
      name: def.name,
      description: def.description,
      leaderName,
      progressLabel,
      thresholdLabel,
      holdDurationSeconds: def.holdDurationSeconds,
      statusLabel,
      conditionMet
    };
    if (leaderPlayerId) objective.leaderPlayerId = leaderPlayerId;
    if (holdRemainingSeconds !== undefined) objective.holdRemainingSeconds = holdRemainingSeconds;
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
