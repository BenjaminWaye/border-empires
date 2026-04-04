import type { Tile } from "@border-empires/shared";
import { parentPort } from "node:worker_threads";

import type { ChunkReadWorkerMessage, ChunkReadWorkerResponse } from "./chunk-read-shared.js";

const port = parentPort;

if (!port) {
  throw new Error("chunk read worker requires parent port");
}

const chunkTilesByKey = new Map<string, readonly Tile[]>();

const cacheKey = (cx: number, cy: number, mode: string): string => `${mode}:${cx},${cy}`;

port.on("message", (message: ChunkReadWorkerMessage) => {
  if (message.type === "hydrate") {
    for (const chunk of message.chunks) {
      chunkTilesByKey.set(cacheKey(chunk.cx, chunk.cy, chunk.mode), chunk.tiles);
    }
    port.postMessage({ type: "ready" } satisfies ChunkReadWorkerResponse);
    return;
  }

  const chunks = message.requests.map((request) => {
    const found = chunkTilesByKey.get(cacheKey(request.cx, request.cy, request.mode));
    return found ? [...found] : [];
  });
  port.postMessage({
    type: "chunks",
    id: message.id,
    chunks
  } satisfies ChunkReadWorkerResponse);
});
