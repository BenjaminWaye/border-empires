import { guestSlotsFullErrorPayload } from "../season-full-rejection/season-full-rejection.js";

type PrepareLikeFn = (
  playerId: string,
  rallyAnchor?: { x: number; y: number; island?: string },
  options?: { isGuest?: boolean }
) => Promise<{ playerId: string; spawned: boolean; joined?: boolean; full?: boolean; guestFull?: boolean; pending?: boolean; scheduledStartAt?: number }>;

// Extracted from gateway-app.ts's big dispatcher switch to keep that
// (already oversized) file from growing. JOIN_SEASON is the only path that
// should call simulationClient.joinSeason -- login only calls preparePlayer.
import { TimeoutError, withTimeout } from "../promise-timeout.js";

// The client's "Joining..." button only clears on JOIN_SEASON_ACK or an ERROR,
// so neither await below may hang indefinitely on a busy simulation. The join
// RPC is the authoritative step (failing it sends JOIN_SEASON_FAILED so the
// player can retry); the spawn-tile lookup is a best-effort camera hint, so it
// gets a much shorter leash and the ack goes out without it.
const JOIN_SEASON_RPC_TIMEOUT_MS = 20_000;
const JOIN_SEASON_SPAWN_TILE_TIMEOUT_MS = 4_000;

export type JoinSeasonMessageDeps = {
  playerId: string;
  /** From the login token; guests are counted against the guest allowance. */
  isGuest?: boolean;
  rallyAnchor?: { x: number; y: number; island?: string } | undefined;
  simulationClient: {
    preparePlayer: PrepareLikeFn;
    joinSeason?: PrepareLikeFn;
  };
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  socket: import("ws").WebSocket;
  seasonFullErrorPayload: () => { type: "ERROR"; code: "SEASON_FULL"; message: string };
  seasonPendingErrorPayload: (scheduledStartAt: number) => { type: "ERROR"; code: "SEASON_PENDING"; message: string; scheduledStartAt: number };
  // Hitting JOIN_SEASON while the season is pending is treated as an
  // implicit "I'm waiting" check-in into the lobby roster (see
  // season-lobby-roster.ts) -- no separate confirm step. All three are
  // optional so existing callers/tests that don't care about the lobby
  // keep working unchanged.
  checkIntoLobby?: (playerId: string) => Promise<{ name: string; countryFlag?: string }>;
  broadcastLobbyUpdate?: () => void;
  // Optional: called only when this JOIN_SEASON actually spawned new
  // territory (result.spawned === true), to source the coordinates of the
  // tile the client should recenter its camera on. The client has no other
  // way to learn where it spawned mid-session -- a fresh INIT is never
  // resent after JOIN_SEASON_ACK, so state.homeTile would otherwise stay at
  // its pre-spawn (usually undefined) value. See client-network.ts's
  // JOIN_SEASON_ACK handler and client-view-refresh.ts's centerOnOwnedTile.
  // Best-effort: if this rejects or is omitted, the ack is still sent
  // without spawnTile and the client falls back to its existing (broken)
  // behavior rather than failing the whole join.
  resolveSpawnTile?: (playerId: string) => Promise<{ x: number; y: number } | undefined>;
  // Player-funnel hook (player-funnel-tracker.ts), fired when result.spawned.
  onSpawned?: (playerId: string) => void;
};

export const handleJoinSeasonMessage = async (deps: JoinSeasonMessageDeps): Promise<void> => {
  const {
    playerId,
    isGuest,
    rallyAnchor,
    simulationClient,
    recordGatewayEvent,
    sendJson,
    socket,
    seasonFullErrorPayload,
    seasonPendingErrorPayload,
    checkIntoLobby,
    broadcastLobbyUpdate,
    resolveSpawnTile,
    onSpawned
  } = deps;
  try {
    const joinFn = simulationClient.joinSeason ?? simulationClient.preparePlayer;
    const result = await withTimeout(
      joinFn(playerId, rallyAnchor, { isGuest: isGuest === true }),
      JOIN_SEASON_RPC_TIMEOUT_MS,
      "join season RPC"
    );
    if (result.pending) {
      const scheduledStartAt = typeof result.scheduledStartAt === "number" ? result.scheduledStartAt : Date.now();
      recordGatewayEvent("info", "gateway_join_season_pending", { playerId, scheduledStartAt });
      sendJson(socket, seasonPendingErrorPayload(scheduledStartAt));
      if (checkIntoLobby && broadcastLobbyUpdate) {
        await checkIntoLobby(playerId);
        broadcastLobbyUpdate();
      }
      return;
    }
    if (result.guestFull) {
      recordGatewayEvent("info", "gateway_join_season_guest_full", { playerId });
      sendJson(socket, guestSlotsFullErrorPayload());
      return;
    }
    if (result.full) {
      recordGatewayEvent("info", "gateway_join_season_full", { playerId });
      sendJson(socket, seasonFullErrorPayload());
      return;
    }
    recordGatewayEvent("info", "gateway_join_season", { playerId, spawned: result.spawned });
    if (result.spawned) onSpawned?.(playerId);
    let spawnTile: { x: number; y: number } | undefined;
    if (result.spawned && resolveSpawnTile) {
      try {
        spawnTile = await withTimeout(resolveSpawnTile(playerId), JOIN_SEASON_SPAWN_TILE_TIMEOUT_MS, "join season spawn tile");
      } catch (error) {
        recordGatewayEvent("warn", "gateway_join_season_spawn_tile_failed", {
          playerId,
          timedOut: error instanceof TimeoutError,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    sendJson(socket, { type: "JOIN_SEASON_ACK", spawned: result.spawned, ...(spawnTile ? { spawnTile } : {}) });
  } catch (error) {
    recordGatewayEvent("warn", "gateway_join_season_failed", { playerId, error: error instanceof Error ? error.message : String(error) });
    sendJson(socket, { type: "ERROR", code: "JOIN_SEASON_FAILED", message: "Could not join the season. Try again." });
  }
};
