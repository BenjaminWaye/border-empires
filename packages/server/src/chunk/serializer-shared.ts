import type { Tile } from "@border-empires/shared";

export type ChunkPayloadChunk = {
  cx: number;
  cy: number;
  tilesMaskedByFog: Tile[];
};

export const serializeChunkFull = (chunk: ChunkPayloadChunk): string =>
  JSON.stringify({
    type: "CHUNK_FULL",
    cx: chunk.cx,
    cy: chunk.cy,
    tilesMaskedByFog: chunk.tilesMaskedByFog
  });
