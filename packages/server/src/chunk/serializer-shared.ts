import type { Tile } from "@border-empires/shared";

export type ChunkPayloadChunk = {
  cx: number;
  cy: number;
  tilesMaskedByFog: Tile[];
};

export type ChunkBuildInput = {
  cx: number;
  cy: number;
  fogTiles: Tile[];
  visibleTiles: Tile[];
  visibleMask: Uint8Array;
};

export const serializeChunkBody = (chunk: ChunkPayloadChunk): string => JSON.stringify(chunk);

export const buildChunkFromInput = (input: ChunkBuildInput): ChunkPayloadChunk => {
  const tilesMaskedByFog = [...input.fogTiles];
  for (let index = 0; index < input.visibleMask.length; index += 1) {
    if (input.visibleMask[index] !== 1) continue;
    tilesMaskedByFog[index] = input.visibleTiles[index]!;
  }
  return {
    cx: input.cx,
    cy: input.cy,
    tilesMaskedByFog
  };
};

export const serializeChunkBatch = (chunks: ChunkPayloadChunk[]): string =>
  JSON.stringify({
    type: "CHUNK_BATCH",
    chunks
  });

export const serializeChunkBatchBodies = (chunkBodies: string[]): string =>
  `{"type":"CHUNK_BATCH","chunks":[${chunkBodies.join(",")}]}`
