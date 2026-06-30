import type { SimulationEvent } from "@border-empires/sim-protocol";

export const DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY = 4_096;
export const DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES = 16_384;
// Hard backstop on the per-command recorded-events map. Once server-generated
// commands are excluded (below) this map only holds genuine client commands, so
// this cap is large headroom that should never evict under normal play — it
// exists purely so an unforeseen server prefix can never re-bloat the snapshot.
export const DEFAULT_MAX_RECORDED_COMMAND_HISTORY = 50_000;

export const isTerminalCommandEvent = (event: SimulationEvent): boolean =>
  event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_RESOLVED" || event.eventType === "COMBAT_CANCELLED";

// commandId prefixes for server-generated commands. These are emitted by the
// simulation itself (AI/system planners, territory automation, economy accrual,
// recovery synthetics) and are NEVER re-submitted by a client, so they need no
// idempotency-replay tracking. Recording their events leaked unboundedly into
// `recordedEventsByCommandId` and bloated every checkpoint snapshot (122k entries
// / 37MB observed in prod). Real client/durable commands are UUIDs (optionally a
// `social:` prefix), which can never match these — so this denylist is fail-safe:
// the worst case of a missed prefix is that one prefix keeps leaking (caught by
// DEFAULT_MAX_RECORDED_COMMAND_HISTORY), never a dropped client command.
export const SERVER_GENERATED_COMMAND_ID_PREFIXES = [
  "ai-runtime",
  "system-runtime",
  "territory-auto:",
  "population-growth-tick:",
  "accrual:",
  "fort-attrition:",
  "muster-spend:",
  "ops-seed-barbs:",
  "recovered-build:",
  "recovered-settle:",
  "startup-gross-income-settlement:",
  "tile-owner-change:",
  "income-tick:",
  "breach:"
] as const;

/**
 * True when a commandId belongs to a client/durable command that may be
 * re-submitted and therefore needs replay-cache idempotency tracking. Returns
 * false for server-generated commands (see SERVER_GENERATED_COMMAND_ID_PREFIXES).
 */
export const isReplayTrackedCommandId = (commandId: string): boolean => {
  for (const prefix of SERVER_GENERATED_COMMAND_ID_PREFIXES) {
    if (commandId.startsWith(prefix)) return false;
  }
  return true;
};
