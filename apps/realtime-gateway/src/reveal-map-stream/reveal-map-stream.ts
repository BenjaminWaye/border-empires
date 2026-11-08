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
}

export const createRevealMapStreamer = (deps: RevealMapStreamDependencies):
  ((socket: WebSocket, playerId: string) => Promise<void>) => async (socket, playerId) => {
  deps.activeSockets.add(socket);
  deps.onActiveStreams(deps.activeSockets.size);
  try {
    const payloadSet = await deps.payloadSet(playerId);
    const fields = {
      playerId, snapshotId: payloadSet.snapshotId, totalTiles: payloadSet.totalTiles,
      chunkCount: payloadSet.chunks.length
    };
    deps.record("gateway_reveal_map_stream_started", {
      ...fields, payloadJsonBytes: payloadSet.payloadJsonBytes, activeStreams: deps.activeSockets.size
    });
    deps.send(socket, payloadSet.begin);
    for (let i = 0; i < payloadSet.chunks.length; i += 1) {
      while (socket.bufferedAmount > 2_000_000 && socket.readyState === socket.OPEN) await deps.sleep(10);
      if (socket.readyState !== socket.OPEN) return;
      deps.send(socket, payloadSet.chunks[i]!);
      deps.onChunk();
      if (i % 4 === 3) await deps.sleep(0);
    }
    if (socket.readyState !== socket.OPEN) return;
    deps.send(socket, payloadSet.end);
    deps.record("gateway_reveal_map_stream_completed", fields);
    deps.onComplete(socket);
  } finally {
    deps.activeSockets.delete(socket);
    deps.onActiveStreams(deps.activeSockets.size);
  }
};
