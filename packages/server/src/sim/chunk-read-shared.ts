import type { Tile } from "@border-empires/shared";

export type ChunkReadMode = "shell" | "thin";

export type ChunkReadRequest = {
  cx: number;
  cy: number;
  mode: ChunkReadMode;
};

export type ChunkReadEntry = ChunkReadRequest & {
  tiles: Tile[];
};

export type ChunkReadTilePatch = {
  cx: number;
  cy: number;
  tileIndex: number;
  tilesByMode: Record<ChunkReadMode, Tile>;
};

export type ChunkReadWorkerMessage =
  | {
      type: "hydrate";
      chunks: ChunkReadEntry[];
    }
  | {
      type: "read";
      id: number;
      requests: ChunkReadRequest[];
    }
  | {
      type: "patch";
      patches: ChunkReadTilePatch[];
    };

export type ChunkReadWorkerResponse =
  | {
      type: "ready";
    }
  | {
      type: "chunks";
      id: number;
      chunks: Tile[][];
    };
