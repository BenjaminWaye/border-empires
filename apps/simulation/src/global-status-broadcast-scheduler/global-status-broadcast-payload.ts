// Builds and emits the periodic GLOBAL_STATUS_UPDATE broadcast (leaderboard +
// season-victory + season-winner/stats + score-history). Extracted out of
// simulation-service.ts (already over the repo's 500-line file cap) so that
// file doesn't grow further -- this module is where the score-history
// sampler (see score-history-sampler.ts) piggybacks on the existing
// broadcast cadence rather than adding a new timer.
import { applyPlayerMessageToSnapshot, type CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { toProtoEvent, type ProtoSimulationEvent } from "../simulation-service/proto-serialization.js";
import { buildLeaderboardFromPlayers, buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import { buildEconomicHegemonyObjective, seasonVictoryForBroadcast } from "../season-victory-objectives/season-victory-objectives.js";
import { leaderboardSignature } from "../season-summary/season-summary.js";
import type { PlayerSubscriptionRegistry } from "../subscription-registry/subscription-registry.js";
import type { PlayerSnapshotCache } from "../player-snapshot-cache/player-snapshot-cache.js";
import type { SimulationMetrics } from "../metrics/metrics.js";
import type { SimulationRuntime } from "../runtime/runtime.js";
import type { ScoreHistorySampler } from "../score-history-sampler/score-history-sampler.js";

export type GlobalStatusBroadcastPayloadDeps = {
  subscriptionRegistry: PlayerSubscriptionRegistry;
  runtime: SimulationRuntime;
  nonCompetitivePlayerIds: ReadonlySet<string> | undefined;
  simulationMetrics: SimulationMetrics;
  snapshotCache: PlayerSnapshotCache;
  eventStreams: Set<{ write: (event: ProtoSimulationEvent) => void }>;
  scoreHistorySampler: ScoreHistorySampler;
  isPersistenceDegradedOrBacklogged: () => boolean;
  getCurrentSummary: () => CurrentSeasonSummary | undefined;
  setCurrentSummary: (summary: CurrentSeasonSummary) => void;
  getCurrentSummarySignature: () => string;
  setCurrentSummarySignature: (signature: string) => void;
  getSelfProgress: () => ReturnType<typeof buildWorldStatusSnapshot>["allPlayerSelfProgressLabels"];
};

export const createGlobalStatusBroadcastPayload = (
  deps: GlobalStatusBroadcastPayloadDeps
): { perform: (commandId: string | undefined) => Promise<void> } => {
  const perform = async (commandId: string | undefined): Promise<void> => {
    if (deps.subscriptionRegistry.subscribedPlayerIds().length === 0) return;
    if (deps.isPersistenceDegradedOrBacklogged()) return;
    const globalLeaderboard = buildLeaderboardFromPlayers(
      deps.runtime.getPlayersForLeaderboard(),
      deps.nonCompetitivePlayerIds
    );
    let currentSummary = deps.getCurrentSummary();
    if (currentSummary) {
      const refreshed = {
        ...currentSummary,
        leaderboard: globalLeaderboard,
        overall: globalLeaderboard.overall,
        byTiles: globalLeaderboard.byTiles,
        byIncome: globalLeaderboard.byIncome,
        byTechs: globalLeaderboard.byTechs,
        updatedAt: Date.now()
      };
      const sig = leaderboardSignature(refreshed);
      if (sig !== deps.getCurrentSummarySignature()) {
        deps.setCurrentSummary(refreshed);
        deps.setCurrentSummarySignature(sig);
        currentSummary = refreshed;
      }
    }
    // Piggyback score-history sampling on this existing periodic broadcast
    // cadence instead of adding a new timer (see score-history-sampler.ts).
    // No-op unless the season changed or the coarse sample interval elapsed.
    if (currentSummary) {
      deps.scoreHistorySampler.sample(
        currentSummary.seasonId,
        Date.now(),
        globalLeaderboard.overall.map((entry) => ({ id: entry.id, name: entry.name, score: entry.score }))
      );
    }
    const acceptLatencyP95Ms = deps.simulationMetrics.currentAcceptLatencyP95Ms();
    const liveEconomicHegemony = buildEconomicHegemonyObjective(globalLeaderboard.overall); // once per tick — sorts the leaderboard; do not move into the loop below
    const scoreHistory = currentSummary ? deps.scoreHistorySampler.seriesFor(currentSummary.seasonId) : [];
    const selfProgress = deps.getSelfProgress();
    for (const subscribedPlayerId of deps.subscriptionRegistry.subscribedPlayerIds()) {
      const selfOverall = globalLeaderboard.overall.find((e) => e.id === subscribedPlayerId);
      const selfByTiles = globalLeaderboard.byTiles.find((e) => e.id === subscribedPlayerId);
      const selfByIncome = globalLeaderboard.byIncome.find((e) => e.id === subscribedPlayerId);
      const selfByTechs = globalLeaderboard.byTechs.find((e) => e.id === subscribedPlayerId);
      const playerLeaderboard = {
        ...globalLeaderboard,
        ...(selfOverall ? { selfOverall } : {}),
        ...(selfByTiles ? { selfByTiles } : {}),
        ...(selfByIncome ? { selfByIncome } : {}),
        ...(selfByTechs ? { selfByTechs } : {})
      };
      const seasonVictory = seasonVictoryForBroadcast(currentSummary?.seasonVictory ?? [], selfProgress.get(subscribedPlayerId), liveEconomicHegemony, subscribedPlayerId, selfOverall?.incomePerMinute);
      const seasonWinner = currentSummary?.seasonWinner;
      const payload = {
        type: "GLOBAL_STATUS_UPDATE" as const,
        leaderboard: playerLeaderboard,
        seasonVictory,
        ...(seasonWinner ? { seasonWinner } : {}),
        ...(currentSummary?.seasonStats ? { seasonStats: currentSummary.seasonStats } : {}),
        ...(scoreHistory.length > 0 ? { scoreHistory } : {}),
        ...(typeof acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms } : {})
      };
      const cachedSnapshot = deps.snapshotCache.peek(subscribedPlayerId);
      if (cachedSnapshot)
        deps.snapshotCache.update(subscribedPlayerId, applyPlayerMessageToSnapshot(cachedSnapshot, payload));
      const globalStatusEvent = toProtoEvent({
        eventType: "PLAYER_MESSAGE",
        commandId: commandId ?? `global-status:${Date.now()}`,
        playerId: subscribedPlayerId,
        messageType: "GLOBAL_STATUS_UPDATE",
        payloadJson: JSON.stringify(payload)
      });
      for (const stream of deps.eventStreams) stream.write(globalStatusEvent);
    }
  };
  return { perform };
};
