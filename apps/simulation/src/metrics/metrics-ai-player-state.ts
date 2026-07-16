import { EMPIRE_STORAGE_FLOOR, STORAGE_MINUTES } from "../runtime-empire-storage.js";
import type { RuntimeAiPlayerMetricsRow } from "../runtime-state-export.js";

// Per-AI-player growth/spend gauges. Bounded to the fixed AI roster for a
// season (5-ish players, not user input), same cardinality precedent as
// simAiLastCommandAcceptedAtMs in metrics.ts.
//
// Design note: this deliberately does NOT add a "gold spent" counter.
// Debiting gold happens at ~11 separate call sites across runtime command
// handler files (runtime-structure-command-handlers.ts, runtime-map-command-
// handlers.ts, runtime/runtime.ts, etc.), none of which currently have any
// metrics plumbing threaded through their context types. Adding a true
// monotonic spend counter would mean wiring a new dependency into all of
// them — a much larger, riskier surface than a metrics-only change justifies.
// Instead, setState is called once per second from the existing metricsTicker
// (see simulation-service.ts) using runtime.exportAiPlayerMetricsSnapshot() —
// a lean, AI-only export that skips the sorts/clones/lock-scan work
// exportPlayerDebugSnapshot() does for every player (see RuntimeAiPlayerMetricsRow
// doc comment in runtime-state-export.ts). Graphed over time, the gold gauge
// dropping between income ticks already shows spend behavior; combined with
// the gold-capacity gauge it answers "are they spending before hitting the
// cap" without new plumbing into every debit site.
//
// EXPAND is tracked as a counter (not a gauge) because it fires from the
// existing onCommand hook (already invoked once per accepted AI command,
// zero new call sites) and is the one growth-relevant command type worth
// distinguishing from SETTLE/BUILD/etc. — see chat history: "EXPAND is the
// only interesting one, not SETTLE".
export const createAiPlayerStateMetrics = () => {
  const goldByPlayer = new Map<string, number>();
  const goldCapacityByPlayer = new Map<string, number>();
  const settledTilesByPlayer = new Map<string, number>();
  const ownedTilesByPlayer = new Map<string, number>();
  const expandTotalByPlayer = new Map<string, number>();

  return {
    snapshot: () => ({
      simAiPlayerGoldGauge: Object.fromEntries(goldByPlayer),
      simAiPlayerGoldCapacityGauge: Object.fromEntries(goldCapacityByPlayer),
      simAiPlayerSettledTilesGauge: Object.fromEntries(settledTilesByPlayer),
      simAiPlayerOwnedTilesGauge: Object.fromEntries(ownedTilesByPlayer),
      simAiExpandTotalByPlayer: Object.fromEntries(expandTotalByPlayer)
    }),
    // Called once per AI player per metricsTicker tick (1s cadence) — see
    // simulation-service.ts. All four values are already computed there from
    // exportPlayerDebugSnapshot(), so this is a pure Map.set, not a new scan.
    setSimAiPlayerState(
      playerId: string,
      values: { gold: number; goldCapacity: number; settledTiles: number; ownedTiles: number }
    ): void {
      goldByPlayer.set(playerId, values.gold);
      goldCapacityByPlayer.set(playerId, values.goldCapacity);
      settledTilesByPlayer.set(playerId, values.settledTiles);
      ownedTilesByPlayer.set(playerId, values.ownedTiles);
    },
    incrementSimAiExpand(playerId: string): void {
      expandTotalByPlayer.set(playerId, (expandTotalByPlayer.get(playerId) ?? 0) + 1);
    }
  };
};

export type AiPlayerStateMetrics = ReturnType<typeof createAiPlayerStateMetrics>;

// Called once per second from simulation-service.ts's existing metricsTicker
// with runtime.exportAiPlayerMetricsSnapshot() rows (already AI-only, so no
// isAi filtering needed here) — no new tile/player scan added by this update.
export const applyAiPlayerDebugSnapshotToMetrics = (
  players: readonly RuntimeAiPlayerMetricsRow[],
  setSimAiPlayerState: AiPlayerStateMetrics["setSimAiPlayerState"]
): void => {
  for (const player of players) {
    setSimAiPlayerState(player.id, {
      gold: player.points,
      goldCapacity: Math.max(EMPIRE_STORAGE_FLOOR.GOLD, player.incomePerMinute * STORAGE_MINUTES),
      settledTiles: player.settledTileCount,
      ownedTiles: player.ownedTileCount
    });
  }
};
