// Extracted from gateway-app.ts's big dispatcher switch to keep that
// (already oversized) file from growing. JOIN_SEASON is the only path that
// should call simulationClient.joinSeason -- login only calls preparePlayer.
export type JoinSeasonMessageDeps = {
  playerId: string;
  rallyAnchor?: { x: number; y: number; island?: string } | undefined;
  simulationClient: {
    preparePlayer: (
      playerId: string,
      rallyAnchor?: { x: number; y: number; island?: string }
    ) => Promise<{ playerId: string; spawned: boolean; joined?: boolean; full?: boolean; pending?: boolean; scheduledStartAt?: number }>;
    joinSeason?: (
      playerId: string,
      rallyAnchor?: { x: number; y: number; island?: string }
    ) => Promise<{ playerId: string; spawned: boolean; joined?: boolean; full?: boolean; pending?: boolean; scheduledStartAt?: number }>;
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
};

export const handleJoinSeasonMessage = async (deps: JoinSeasonMessageDeps): Promise<void> => {
  const {
    playerId,
    rallyAnchor,
    simulationClient,
    recordGatewayEvent,
    sendJson,
    socket,
    seasonFullErrorPayload,
    seasonPendingErrorPayload,
    checkIntoLobby,
    broadcastLobbyUpdate,
    resolveSpawnTile
  } = deps;
  try {
    const joinFn = simulationClient.joinSeason ?? simulationClient.preparePlayer;
    const result = await joinFn(playerId, rallyAnchor);
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
    if (result.full) {
      recordGatewayEvent("info", "gateway_join_season_full", { playerId });
      sendJson(socket, seasonFullErrorPayload());
      return;
    }
    recordGatewayEvent("info", "gateway_join_season", { playerId, spawned: result.spawned });
    let spawnTile: { x: number; y: number } | undefined;
    if (result.spawned && resolveSpawnTile) {
      try {
        spawnTile = await resolveSpawnTile(playerId);
      } catch (error) {
        recordGatewayEvent("warn", "gateway_join_season_spawn_tile_failed", {
          playerId,
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
