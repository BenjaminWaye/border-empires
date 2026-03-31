import { parentPort } from "node:worker_threads";
import { buildChunkFromInput, serializeChunkBody, type ChunkBuildInput, type ChunkPayloadChunk } from "./serializer-shared.js";

type ChunkSerializerRequest = {
  id: number;
  chunk?: ChunkPayloadChunk;
  chunks?: ChunkBuildInput[];
};

type ChunkSerializerResponse =
  | { id: number; payload: string }
  | { id: number; payloads: string[] }
  | { id: number; error: string };

const port = parentPort;

if (port) {
  port.on("message", (message: ChunkSerializerRequest) => {
    try {
      const response: ChunkSerializerResponse = message.chunks
        ? { id: message.id, payloads: message.chunks.map((chunk) => serializeChunkBody(buildChunkFromInput(chunk))) }
        : { id: message.id, payload: serializeChunkBody(message.chunk!) };
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
