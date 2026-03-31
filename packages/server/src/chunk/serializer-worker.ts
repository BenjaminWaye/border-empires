import { parentPort } from "node:worker_threads";
import { serializeChunkBody, type ChunkPayloadChunk } from "./serializer-shared.js";

type ChunkSerializerRequest = {
  id: number;
  chunk: ChunkPayloadChunk;
};

type ChunkSerializerResponse =
  | { id: number; payload: string }
  | { id: number; error: string };

const port = parentPort;

if (port) {
  port.on("message", (message: ChunkSerializerRequest) => {
    try {
      const payload = serializeChunkBody(message.chunk);
      const response: ChunkSerializerResponse = { id: message.id, payload };
      port.postMessage(response);
    } catch (err) {
      const response: ChunkSerializerResponse = {
        id: message.id,
        error: err instanceof Error ? err.message : String(err)
      };
      port.postMessage(response);
    }
  });
}
