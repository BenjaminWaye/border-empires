// PLAYER_UPDATE emission scheduling, extracted out of Runtime.emitPlayerStateUpdate
// (runtime.ts is over the per-file line cap).
//
// A PLAYER_UPDATE is a UI push (gold, manpower, integrity, slots, ...) but
// producing one is expensive: it reads every per-player derived cache
// (defensibility O(owned tiles), economy snapshot + town network, resource
// slots, manpower structure bonus), all of which the command that triggered
// the emit typically just invalidated. During combat, resolveLock emits one
// per lock resolution for the human attacker and any human defender whose
// tile flipped -- with the muster system auto-firing attacks every tick,
// that was a full rebuild of a 14k-tile empire's caches many times a
// second (2026-09-17 evening prod profile: resolveLock ->
// emitPlayerStateUpdate = 23% of sim-worker time, sim only 32% idle).
//
// Coalescing: the first request for a player emits synchronously (an
// isolated command still gets instant feedback and every existing
// single-command test keeps its synchronous semantics); further requests
// inside `windowMs` collapse into ONE trailing emit at the window's end,
// carrying the latest commandId. Nothing else changes: COMMAND_RESOLVED /
// TILE_DELTA_BATCH are still emitted synchronously by the handlers
// themselves; only the derived-state push is rate-limited per player.
// windowMs = 0 disables coalescing entirely (the Runtime default, so unit
// tests are unaffected; the service enables it from
// SIMULATION_PLAYER_UPDATE_COALESCE_MS).
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";

type UpdateCommand = Pick<CommandEnvelope, "commandId" | "playerId">;

export type PlayerUpdateEmitterOptions = {
  windowMs: number;
  now: () => number;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  /** Builds and sends the PLAYER_UPDATE for `playerId` right now. */
  emit: (command: UpdateCommand, playerId: string) => void;
  /** Runs after every real emit (Runtime.flushOutpostVisionDormancyResync). */
  afterEmit?: ((playerId: string) => void) | undefined;
  trackSync?: MainThreadTaskTracker["trackSync"] | undefined;
  /**
   * Called when a TRAILING (timer-driven) emit throws. The leading emit runs
   * inside the caller's own stack and propagates like it always did; a
   * trailing emit runs from scheduleAfter, where an uncaught throw would
   * take the whole sim thread down, so it is caught and reported here.
   */
  onError?: ((error: unknown, playerId: string) => void) | undefined;
};

export type PlayerUpdateEmitter = {
  request: (command: UpdateCommand, playerId?: string) => void;
  /** Emits any pending coalesced updates immediately (shutdown / tests). */
  flushAll: () => void;
  pendingCount: () => number;
};

export const createPlayerUpdateEmitter = (options: PlayerUpdateEmitterOptions): PlayerUpdateEmitter => {
  const windowMs = Math.max(0, options.windowMs);
  // Keyed by player id: bounded by the season's player cap, and the emitter
  // is recreated with the runtime on season rollover.
  const lastEmittedAtByPlayer = new Map<string, number>();
  const pendingByPlayer = new Map<string, UpdateCommand>();
  const timerArmedByPlayer = new Set<string>();

  const emitNow = (command: UpdateCommand, playerId: string): void => {
    lastEmittedAtByPlayer.set(playerId, options.now());
    // Instrumentation (2026-07-28 login-stall investigation): everything the
    // emit calls (cachedDefensibilityMetrics, autoSettlementQueueForPlayer,
    // ...) was previously untracked, so a slow call anywhere in here showed
    // up as unattributed time inside whichever OUTER phase happened to call
    // it. The whole emit is wrapped as one phase; inner phases narrow it.
    const run = (): void => options.emit(command, playerId);
    if (options.trackSync) options.trackSync("emit_player_state_update", { playerId }, run);
    else run();
    // Piggybacks on the dormancy rebuild the emit's own cachedEconomySnapshot
    // call already just did -- see flushOutpostVisionDormancyResync's doc
    // comment on markOutpostVisionDormancyDirty for why this is deferred
    // here instead of resolved inside replaceTileState.
    options.afterEmit?.(playerId);
  };

  const flushPlayer = (playerId: string): void => {
    timerArmedByPlayer.delete(playerId);
    const pending = pendingByPlayer.get(playerId);
    if (!pending) return;
    pendingByPlayer.delete(playerId);
    try {
      emitNow(pending, playerId);
    } catch (error) {
      if (!options.onError) throw error;
      options.onError(error, playerId);
    }
  };

  return {
    request: (command, playerId = command.playerId) => {
      if (windowMs === 0) {
        emitNow(command, playerId);
        return;
      }
      const sinceLast = options.now() - (lastEmittedAtByPlayer.get(playerId) ?? Number.NEGATIVE_INFINITY);
      if (sinceLast >= windowMs && !pendingByPlayer.has(playerId)) {
        emitNow(command, playerId);
        return;
      }
      pendingByPlayer.set(playerId, command);
      if (timerArmedByPlayer.has(playerId)) return;
      timerArmedByPlayer.add(playerId);
      options.scheduleAfter(Math.max(1, windowMs - sinceLast), () => flushPlayer(playerId));
    },
    flushAll: () => {
      for (const playerId of [...pendingByPlayer.keys()]) flushPlayer(playerId);
    },
    pendingCount: () => pendingByPlayer.size
  };
};
