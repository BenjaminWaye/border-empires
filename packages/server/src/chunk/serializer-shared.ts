import type { Tile } from "@border-empires/shared";

export type ChunkPayloadChunk = {
  cx: number;
  cy: number;
  tilesMaskedByFog: Tile[];
};

export const serializeChunkBody = (chunk: ChunkPayloadChunk): string => JSON.stringify(chunk);

export const serializeChunkBatch = (chunks: ChunkPayloadChunk[]): string =>
  JSON.stringify({
    type: "CHUNK_BATCH",
    chunks
  });

export const serializeChunkBatchBodies = (chunkBodies: string[]): string =>
  `{"type":"CHUNK_BATCH","chunks":[${chunkBodies.join(",")}]}`
