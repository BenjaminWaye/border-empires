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

export type ChunkReadWorkerMessage =
  | {
      type: "hydrate";
      chunks: ChunkReadEntry[];
    }
  | {
      type: "read";
      id: number;
      requests: ChunkReadRequest[];
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
