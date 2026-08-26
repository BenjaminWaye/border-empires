import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import { hasPlayerJoinedSeason, withPlayerJoinedSeason, isSeasonActive, isSeasonPending, isSeasonEnded } from "../season-lifecycle.js";
import { seasonIsAtPlayerCap } from "../season-join-capacity.js";
import { tryDrainDevQueue } from "../runtime-dev-queue-command-handlers.js";
import { emitPerConnectHellos } from "./per-connect-hellos.js";
import type { createSimulationMetrics } from "../metrics/metrics.js";
import type { SimulationRuntime } from "../runtime/runtime.js";

export const parseRallyAnchor = (value: string | undefined): { x: number; y: number } | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return undefined;
    if (!Number.isInteger(parsed.x) || !Number.isInteger(parsed.y)) return undefined;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return undefined;
  }
};

type PrepareOrJoinDeps = {
  runtime: SimulationRuntime;
  log: { info: (payload: Record<string, unknown>, message: string) => void; error: (payload: Record<string, unknown>, message: string) => void };
  simulationMetrics: ReturnType<typeof createSimulationMetrics>;
  deleteCachedSnapshot: (playerId: string) => void;
  getSeasonState: () => SimulationSeasonState;
  setSeasonState: (seasonState: SimulationSeasonState) => void;
  maxSeasonPlayers: number;
};

const spawnAndAnnounce = (
  deps: PrepareOrJoinDeps,
  playerId: string,
  rallyAnchor: { x: number; y: number } | undefined,
  logMessage: string,
  recordSpawnMetric = false
): boolean => {
  const spawnStartedAt = Date.now();
  const spawned = deps.runtime.ensurePlayerHasSpawnTerritory(playerId, rallyAnchor);
  if (recordSpawnMetric) deps.simulationMetrics.observeSimPreparePlayerLatencyMs("spawn", Date.now() - spawnStartedAt);
  if (spawned) {
    deps.deleteCachedSnapshot(playerId);
    deps.log.info({ playerId }, logMessage);
  }
  emitPerConnectHellos(
    {
      emitShardRainHelloFor: (id) => deps.runtime.emitShardRainHelloFor(id),
      resendReachForPlayer: (id) => deps.runtime.resendReachForPlayer(id),
      drainDevQueueForPlayer: (id) => tryDrainDevQueue(deps.runtime.devQueueCommandContext(), id),
      refreshResourceSlotCachesForPlayer: (id) => deps.runtime.refreshResourceSlotCachesForPlayer(id)
    },
    playerId,
    deps.log
  );
  return spawned;
};

// PreparePlayer runs on every authenticated connection, so it must never
// silently admit a player who has not explicitly joined the active season —
// otherwise any reconnect after a season rollover would carry that player
// into the new season without them ever choosing to join it. Only a player
// already known to the runtime (an existing record) or explicitly recorded
// as joined (via JoinSeason) gets prepared/respawned here. It never spawns a
// genuinely new player, so the season player cap is not checked here — that
// gate belongs to JoinSeason, the only path that admits new players.
export const preparePlayerHandler = (
  deps: PrepareOrJoinDeps,
  call: { request: { player_id: string; rally_anchor_json?: string } },
  callback: (
    error: Error | null,
    response: { ok: boolean; player_id: string; playerId?: string; spawned: boolean; joined: boolean; full?: boolean; pending?: boolean; scheduled_start_at?: number }
  ) => void
): void => {
  const playerId = call.request.player_id;
  const prepareStartedAt = Date.now();
  const preparePlayerSlowLogMs = 250;
  let spawned = false;
  const seasonState = deps.getSeasonState();
  const joined = deps.runtime.hasPlayer(playerId) || hasPlayerJoinedSeason(seasonState, playerId);
  try {
    // A reconnecting client that hasn't joined the pending season yet needs
    // to know that up front, on this same PreparePlayer round trip -- not
    // discover it only after the client separately tries JOIN_SEASON and
    // gets rejected. Without this, every page reload during the pending
    // countdown showed the generic "Join Season?" prompt instead of jumping
    // straight back into the countdown lobby the player was already in.
    if (!joined && isSeasonPending(seasonState)) {
      const prepareDurationMs = Date.now() - prepareStartedAt;
      deps.simulationMetrics.observeSimPreparePlayerLatencyMs("prepare", prepareDurationMs);
      callback(null, {
        ok: true,
        player_id: playerId,
        playerId,
        spawned: false,
        joined: false,
        pending: true,
        ...(typeof seasonState.scheduledStartAt === "number" ? { scheduled_start_at: seasonState.scheduledStartAt } : {})
      });
      return;
    }
    if (isSeasonActive(seasonState) && joined) {
      spawned = spawnAndAnnounce(deps, playerId, parseRallyAnchor(call.request.rally_anchor_json), "spawned runtime territory for prepared player", true);
    }
    const prepareDurationMs = Date.now() - prepareStartedAt;
    deps.simulationMetrics.observeSimPreparePlayerLatencyMs("prepare", prepareDurationMs);
    if (spawned || prepareDurationMs >= preparePlayerSlowLogMs) {
      deps.log.info({ playerId, prepareDurationMs, spawned }, "prepare player completed");
    }
    callback(null, { ok: true, player_id: playerId, playerId, spawned, joined });
  } catch (error) {
    deps.simulationMetrics.observeSimPreparePlayerLatencyMs("prepare", Date.now() - prepareStartedAt);
    deps.log.error({ playerId, error: error instanceof Error ? error.message : String(error) }, "prepare player failed");
    callback(error instanceof Error ? error : new Error("failed to prepare simulation player"), {
      ok: false,
      player_id: playerId,
      playerId,
      spawned,
      joined
    });
  }
};

// JoinSeason is the only path that records season membership and spawns a
// brand-new player's starting territory, so it is where the season player
// cap is enforced: a genuinely new player is turned away with full:true (and
// never recorded as joined) once the season is full, while a returning
// player who already has runtime territory is never blocked (see
// seasonIsAtPlayerCap).
export const joinSeasonHandler = (
  deps: PrepareOrJoinDeps,
  call: { request: { player_id: string; rally_anchor_json?: string } },
  callback: (
    error: Error | null,
    response: { ok: boolean; player_id: string; playerId?: string; spawned: boolean; full?: boolean; pending?: boolean; scheduled_start_at?: number }
  ) => void
): void => {
  const playerId = call.request.player_id;
  try {
    const seasonState = deps.getSeasonState();
    if (isSeasonEnded(seasonState)) {
      callback(new Error("cannot join an ended season"), { ok: false, player_id: playerId, playerId, spawned: false });
      return;
    }
    if (isSeasonPending(seasonState)) {
      deps.log.info({ playerId, scheduledStartAt: seasonState.scheduledStartAt }, "join season rejected: season is pending");
      callback(null, {
        ok: true,
        player_id: playerId,
        playerId,
        spawned: false,
        pending: true,
        ...(typeof seasonState.scheduledStartAt === "number" ? { scheduled_start_at: seasonState.scheduledStartAt } : {})
      });
      return;
    }
    if (seasonIsAtPlayerCap(deps.maxSeasonPlayers, deps.runtime, playerId)) {
      deps.log.info({ playerId, maxSeasonPlayers: deps.maxSeasonPlayers }, "join season rejected: season is full");
      callback(null, { ok: true, player_id: playerId, playerId, spawned: false, full: true });
      return;
    }
    deps.setSeasonState(withPlayerJoinedSeason(deps.getSeasonState(), playerId));
    const spawned = spawnAndAnnounce(deps, playerId, parseRallyAnchor(call.request.rally_anchor_json), "spawned runtime territory for joined player", true);
    callback(null, { ok: true, player_id: playerId, playerId, spawned });
  } catch (error) {
    deps.log.error({ playerId, error: error instanceof Error ? error.message : String(error) }, "join season failed");
    callback(error instanceof Error ? error : new Error("failed to join season"), { ok: false, player_id: playerId, playerId, spawned: false });
  }
};
