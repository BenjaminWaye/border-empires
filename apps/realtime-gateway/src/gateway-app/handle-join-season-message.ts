// Extracted from gateway-app.ts's big dispatcher switch to keep that
// (already oversized) file from growing. JOIN_SEASON is the only path that
// should call simulationClient.joinSeason -- login only calls preparePlayer.
export type JoinSeasonMessageDeps = {
  playerId: string;
  rallyAnchor?: { x: number; y: number; island?: string } | undefined;
  simulationClient: {
    preparePlayer: (playerId: string, rallyAnchor?: { x: number; y: number; island?: string }) => Promise<{ playerId: string; spawned: boolean; joined?: boolean; full?: boolean }>;
    joinSeason?: (playerId: string, rallyAnchor?: { x: number; y: number; island?: string }) => Promise<{ playerId: string; spawned: boolean; joined?: boolean; full?: boolean }>;
  };
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  socket: import("ws").WebSocket;
  seasonFullErrorPayload: () => { type: "ERROR"; code: "SEASON_FULL"; message: string };
};

export const handleJoinSeasonMessage = async (deps: JoinSeasonMessageDeps): Promise<void> => {
  const { playerId, rallyAnchor, simulationClient, recordGatewayEvent, sendJson, socket, seasonFullErrorPayload } = deps;
  try {
    const joinFn = simulationClient.joinSeason ?? simulationClient.preparePlayer;
    const result = await joinFn(playerId, rallyAnchor);
    if (result.full) {
      recordGatewayEvent("info", "gateway_join_season_full", { playerId });
      sendJson(socket, seasonFullErrorPayload());
      return;
    }
    recordGatewayEvent("info", "gateway_join_season", { playerId, spawned: result.spawned });
    sendJson(socket, { type: "JOIN_SEASON_ACK", spawned: result.spawned });
  } catch (error) {
    recordGatewayEvent("warn", "gateway_join_season_failed", { playerId, error: error instanceof Error ? error.message : String(error) });
    sendJson(socket, { type: "ERROR", code: "JOIN_SEASON_FAILED", message: "Could not join the season. Try again." });
  }
};
