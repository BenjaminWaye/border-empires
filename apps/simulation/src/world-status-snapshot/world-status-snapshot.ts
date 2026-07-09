import type { SimulationRuntime } from "../runtime/runtime.js";
import { estimateIncomePerMinuteFromTiles } from "../player-runtime-summary.js";
import { computeSeasonVictory, mergeSelfProgress } from "../season-victory-objectives/season-victory-objectives.js";
import { anonymizedEmpireNameForId, isOpaquePlayerId, type SeasonVictoryPathId } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { LeaderboardMetricEntry, LeaderboardOverallEntry, WorldStatusSnapshot } from "@border-empires/sim-protocol";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

type WorldTile = RuntimeState["tiles"][number];

const BARBARIAN_PLAYER_ID = "barbarian-1";

const isCompetitivePlayer = (playerId: string, excludedIds?: ReadonlySet<string>): boolean =>
  playerId !== BARBARIAN_PLAYER_ID && !(excludedIds?.has(playerId) ?? false);

const hasZeroActivity = (entry: { tiles: number; incomePerMinute: number; techs: number }): boolean =>
  entry.tiles === 0 && entry.incomePerMinute === 0 && entry.techs === 0;
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

export const buildWorldStatusSnapshot = (
  playerId: string,
  runtimeState: RuntimeState,
  fallbackTiles?: Iterable<DomainTileState>,
  options?: { acceptLatencyP95Ms?: number; nonCompetitivePlayerIds?: ReadonlySet<string> }
): WorldStatusSnapshot & { allPlayerSelfProgressLabels: Map<string, Map<SeasonVictoryPathId, string>> } => {
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
    .filter((entry) => !hasZeroActivity(entry))
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
  const { objectives, selfProgressLabelsByPlayerId } = computeSeasonVictory(worldTiles, overall, runtimeState.players);

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
    seasonVictory: mergeSelfProgress(objectives, selfProgressLabelsByPlayerId.get(playerId)),
    allPlayerSelfProgressLabels: selfProgressLabelsByPlayerId,
    ...(typeof options?.acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms: options.acceptLatencyP95Ms } : {})
  };
};

/**
 * Cheap O(n_players) leaderboard build with no tile iteration.
 * Phase 3b: used by the global-status broadcast so it no longer needs
 * the full exportStateAsync (O(202k-tile)) on every cycle.
 * Season-victory objectives are NOT computed here — callers should merge the
 * cached currentSummary.seasonVictory with allPlayerSelfProgressLabels (both
 * from the last buildWorldStatusSnapshot scan) via mergeSelfProgress().
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
    .filter((entry) => !hasZeroActivity(entry))
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

