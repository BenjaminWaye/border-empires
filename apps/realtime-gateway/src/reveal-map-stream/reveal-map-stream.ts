import type { WebSocket } from "ws";
import type { RevealMapPayloadSet } from "../reveal-map-chunk-cache/reveal-map-chunk-cache.js";
import type { BroadcastPayload } from "../broadcast-payload/broadcast-payload.js";

export interface RevealMapStreamDependencies {
  activeSockets: Set<WebSocket>;
  payloadSet: (playerId: string) => Promise<RevealMapPayloadSet>;
  send: (socket: WebSocket, payload: BroadcastPayload) => void;
  sleep: (ms: number) => Promise<void>;
  onActiveStreams: (count: number) => void;
  onChunk: () => void;
  onComplete: (socket: WebSocket) => void;
  record: (event: string, fields: Record<string, string | number>) => void;
  /** Live payloads held per socket while its reveal streams (default 5000). */
  maxHeldPayloads?: number;
}

export interface RevealMapStreamer {
  /**
   * Streams the revealed map to one socket. `stillWanted` is checked before
   * every send: once it turns false (fog restored, socket re-authenticated)
   * the stream stops and its held deltas are dropped. Rejects if the export
   * fails; held deltas are dropped then too, because they are unfiltered and
   * the socket never got the revealed map to apply them to.
   */
  stream: (socket: WebSocket, playerId: string, stillWanted: () => boolean) => Promise<void>;
  isStreaming: (socket: WebSocket) => boolean;
  /**
   * Sends a live spectator (unfiltered) tile-delta payload, unless the socket
   * is mid-reveal: then it is held and sent right after the last chunk.
   * Spectating starts before the full-world export is taken, so a delta can
   * describe a change the export already contains or one it missed.
   * Replaying them in order on top of the finished map is correct in both
   * cases; sending one early would let a later chunk overwrite it with older
   * state.
   */
  sendOrHold: (socket: WebSocket, payload: BroadcastPayload) => void;
}

const DEFAULT_MAX_HELD_PAYLOADS = 5_000;

export const createRevealMapStreamer = (deps: RevealMapStreamDependencies): RevealMapStreamer => {
  const maxHeldPayloads = Math.max(1, deps.maxHeldPayloads ?? DEFAULT_MAX_HELD_PAYLOADS);
  // One entry per socket in deps.activeSockets, removed when its stream ends.
  const heldBySocket = new Map<WebSocket, BroadcastPayload[]>();

  const flushHeld = (socket: WebSocket): void => {
    const held = heldBySocket.get(socket);
    heldBySocket.delete(socket);
    if (!held || socket.readyState !== socket.OPEN) return;
    for (const payload of held) deps.send(socket, payload);
  };
  const dropHeld = (socket: WebSocket): void => {
    heldBySocket.delete(socket);
  };

  return {
    isStreaming: (socket) => deps.activeSockets.has(socket),
    sendOrHold: (socket, payload) => {
      const held = heldBySocket.get(socket);
      if (!held) {
        deps.send(socket, payload);
        return;
      }
      if (held.length >= maxHeldPayloads) {
        // Bounded: stop holding and deliver in arrival order. A chunk still in
        // flight may overwrite some of these tiles with older state until
        // they next change, which beats growing without limit.
        deps.record("gateway_reveal_map_held_overflow", { heldPayloads: held.length });
        flushHeld(socket);
        deps.send(socket, payload);
        return;
      }
      held.push(payload);
    },
    stream: async (socket, playerId, stillWanted) => {
      if (deps.activeSockets.has(socket)) throw new Error("reveal already streaming on this socket");
      deps.activeSockets.add(socket);
      heldBySocket.set(socket, []);
      deps.onActiveStreams(deps.activeSockets.size);
      const live = (): boolean => socket.readyState === socket.OPEN && stillWanted();
      try {
        const payloadSet = await deps.payloadSet(playerId);
        if (!live()) return;
        const fields = {
          playerId, snapshotId: payloadSet.snapshotId, totalTiles: payloadSet.totalTiles,
          chunkCount: payloadSet.chunks.length
        };
        deps.record("gateway_reveal_map_stream_started", {
          ...fields, payloadJsonBytes: payloadSet.payloadJsonBytes, activeStreams: deps.activeSockets.size
        });
        deps.send(socket, payloadSet.begin);
        for (let i = 0; i < payloadSet.chunks.length; i += 1) {
          while (socket.bufferedAmount > 2_000_000 && live()) await deps.sleep(10);
          if (!live()) return;
          deps.send(socket, payloadSet.chunks[i]!);
          deps.onChunk();
          if (i % 4 === 3) await deps.sleep(0);
        }
        if (!live()) return;
        deps.send(socket, payloadSet.end);
        flushHeld(socket);
        deps.record("gateway_reveal_map_stream_completed", fields);
        deps.onComplete(socket);
      } finally {
        // Only a completed stream delivers what it held (flushHeld above).
        dropHeld(socket);
        deps.activeSockets.delete(socket);
        deps.onActiveStreams(deps.activeSockets.size);
      }
    }
  };
};
