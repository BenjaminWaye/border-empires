import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "../tile-detail-snapshot/tile-detail-snapshot.js";

export type PushAuthoritativeTileDetailParams = {
  socket: import("ws").WebSocket;
  playerId: string;
  x: number;
  y: number;
  fogDisabled: boolean;
  snapshotForPlayer: (playerId: string) => PlayerSubscriptionSnapshot | undefined;
  fetchTileDetailFromSim: (
    playerId: string,
    x: number,
    y: number,
    fullVisibility: boolean
  ) => Promise<PlayerSubscriptionSnapshot | undefined>;
  simulationConnected: boolean;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  // When true (REQUEST_TILE_DETAIL), send TILE_DETAIL_UNAVAILABLE / SERVER_STARTING
  // ERRORs on a miss, matching the original handler exactly. When false
  // (self-heal-on-rejection), the caller already sent an ERROR for the
  // rejected command, so we stay silent on a miss instead of piling on a
  // second, confusing ERROR.
  sendErrorsOnMiss: boolean;
};

// Reproduces the REQUEST_TILE_DETAIL handler's push logic exactly: send the
// cached snapshot's tile detail immediately (if any), then kick off a fresh
// sim fetch and push its result too. Extracted so the COMMAND_REJECTED
// self-heal path (see tile-detail-self-heal.ts) can reuse the same
// authoritative-push behavior without duplicating it.
export const pushAuthoritativeTileDetail = ({
  socket,
  playerId,
  x,
  y,
  fogDisabled,
  snapshotForPlayer,
  fetchTileDetailFromSim,
  simulationConnected,
  sendJson,
  recordGatewayEvent,
  sendErrorsOnMiss
}: PushAuthoritativeTileDetailParams): void => {
  const cachedSnapshot = snapshotForPlayer(playerId);
  const cachedTileDetail = buildSnapshotTileDetail(cachedSnapshot, playerId, x, y);
  if (cachedTileDetail) {
    sendJson(socket, {
      type: "TILE_DELTA",
      updates: [cachedTileDetail]
    });
  }
  if (simulationConnected) {
    void fetchTileDetailFromSim(playerId, x, y, fogDisabled)
      .then((snapshot) => {
        if (!snapshot) return;
        const freshTileDetail = buildSnapshotTileDetail(snapshot, playerId, x, y);
        if (freshTileDetail) {
          sendJson(socket, {
            type: "TILE_DELTA",
            updates: [freshTileDetail]
          });
        }
      })
      .catch((error) => {
        recordGatewayEvent("warn", "gateway_tile_detail_fetch_failed", {
          playerId,
          x,
          y,
          error: error instanceof Error ? error.message : String(error)
        });
        if (!cachedTileDetail && sendErrorsOnMiss) {
          sendJson(socket, {
            type: "ERROR",
            code: "TILE_DETAIL_UNAVAILABLE",
            message: "Tile detail is temporarily unavailable."
          });
        }
      });
  } else if (!cachedTileDetail && sendErrorsOnMiss) {
    sendJson(socket, {
      type: "ERROR",
      code: "SERVER_STARTING",
      message: "Realtime simulation is temporarily unavailable. Retry shortly."
    });
  }
};
