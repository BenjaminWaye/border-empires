import type { WebSocket } from "ws";
import type { RevealMapStreamer } from "../reveal-map-stream/reveal-map-stream.js";

// Handles one fog admin's request to reveal the whole map on one socket
// (REQUEST_REVEAL_MAP, and SET_FOG_DISABLED true as its legacy alias).
//
// A revealed socket receives the simulation's unfiltered "spectator" tile
// deltas and no fog-filtered ones; every other socket of the same account
// keeps its ordinary fogged stream (see gateway-app.ts TILE_DELTA_BATCH).
// So the socket's `fogDisabled` flag decides which stream it gets, and this
// module is the only place that turns it on.

export type RevealRequestSession = {
  playerId?: string | undefined;
  channel: string;
  canToggleFog: boolean;
  fogDisabled: boolean;
};

export interface RevealMapRequestDependencies {
  streamer: Pick<RevealMapStreamer, "stream" | "isStreaming">;
  activeStreamCount: () => number;
  maxConcurrentStreams: number;
  cooldownMs: number;
  lastRequestMsByPlayerId: Map<string, number>;
  now: () => number;
  bumpFogIntent: (playerId: string) => void;
  /** Tells the simulation whether the player still has any revealed socket. */
  syncSpectating: (playerId: string) => void;
  /** The player's current fogged view (TILE_SNAPSHOT_REPLACE), from the gateway cache. */
  foggedReplacement: (playerId: string) => unknown;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  record: (level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) => void;
}

export const createRevealMapRequestHandler = (deps: RevealMapRequestDependencies) =>
  (socket: WebSocket, session: RevealRequestSession): void => {
    const playerId = session.playerId;
    if (!playerId) return;
    if (!session.canToggleFog) {
      deps.record("warn", "gateway_reveal_map_forbidden", { playerId, channel: session.channel });
      deps.sendJson(socket, { type: "ERROR", code: "FORBIDDEN", message: "reveal map unavailable" });
      return;
    }
    const now = deps.now();
    const lastRequestedAt = deps.lastRequestMsByPlayerId.get(playerId) ?? 0;
    if (now - lastRequestedAt < deps.cooldownMs) {
      deps.record("warn", "gateway_reveal_map_throttled", {
        playerId, channel: session.channel, cooldownRemainingMs: deps.cooldownMs - (now - lastRequestedAt)
      });
      deps.sendJson(socket, { type: "ERROR", code: "REVEAL_MAP_THROTTLED", message: "reveal request rate limit" });
      return;
    }
    // One stream per socket: a second one would share the first's held deltas.
    if (deps.streamer.isStreaming(socket) || deps.activeStreamCount() >= deps.maxConcurrentStreams) {
      deps.record("warn", "gateway_reveal_map_overloaded", {
        playerId, channel: session.channel, activeStreams: deps.activeStreamCount(), cap: deps.maxConcurrentStreams
      });
      deps.sendJson(socket, { type: "ERROR", code: "REVEAL_MAP_BUSY", message: "reveal capacity exceeded" });
      return;
    }
    deps.lastRequestMsByPlayerId.set(playerId, now);
    deps.bumpFogIntent(playerId);
    session.fogDisabled = true;
    // A fog restore or re-auth clears fogDisabled or changes the player; the
    // stream stops at its next send and leaves the socket's view to them.
    const stillWanted = (): boolean => session.fogDisabled && session.playerId === playerId;
    void deps.streamer.stream(socket, playerId, stillWanted).catch((error: unknown) => {
      deps.record("error", "gateway_reveal_map_stream_failed", {
        playerId, error: error instanceof Error ? error.message : String(error)
      });
      if (!stillWanted()) return;
      // The client never got the revealed map, and while fogDisabled was set
      // this socket received no fogged deltas: put it back on its fogged view.
      session.fogDisabled = false;
      deps.syncSpectating(playerId);
      if (socket.readyState !== socket.OPEN) return;
      deps.sendJson(socket, { type: "ERROR", code: "REVEAL_MAP_UNAVAILABLE", message: "Full-map reveal is temporarily unavailable." });
      deps.sendJson(socket, { type: "FOG_UPDATE", fogDisabled: false });
      const fogged = deps.foggedReplacement(playerId);
      if (fogged) deps.sendJson(socket, fogged);
    });
  };
