import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { preSerializeBroadcast, type BroadcastPayload } from "../broadcast-payload/broadcast-payload.js";

type TilePayload = Array<Record<string, unknown>>;

export type RevealMapBeginPayload = {
  type: "REVEAL_MAP_BEGIN";
  snapshotId: string;
  totalTiles: number;
  chunkCount: number;
};

export type RevealMapChunkPayload = {
  type: "REVEAL_MAP_CHUNK";
  snapshotId: string;
  chunkIndex: number;
  chunkCount: number;
  tiles: TilePayload;
};

export type RevealMapEndPayload = {
  type: "REVEAL_MAP_END";
  snapshotId: string;
};

export type RevealMapPayloadSet = {
  snapshotId: string;
  totalTiles: number;
  begin: BroadcastPayload;
  chunks: BroadcastPayload[];
  end: BroadcastPayload;
  payloadJsonBytes: number;
};

type RevealMapChunkCacheDeps = {
  chunkSize?: number;
  jsonSafeTileDeltaBatch: (
    tileDeltas: Array<NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>>
  ) => TilePayload;
};

export type RevealMapChunkCache = {
  current: () => RevealMapPayloadSet | undefined;
  getOrCreate: (snapshot: PlayerSubscriptionSnapshot) => RevealMapPayloadSet;
  clear: () => void;
};

const DEFAULT_REVEAL_MAP_CHUNK_SIZE = 2_000;

export const createRevealMapChunkCache = (deps: RevealMapChunkCacheDeps): RevealMapChunkCache => {
  const chunkSize = Math.max(1, Math.floor(deps.chunkSize ?? DEFAULT_REVEAL_MAP_CHUNK_SIZE));
  let cachedTiles: PlayerSubscriptionSnapshot["tiles"] | undefined;
  let cachedPayloadSet: RevealMapPayloadSet | undefined;

  return {
    current() {
      return cachedPayloadSet;
    },
    getOrCreate(snapshot) {
      if (cachedTiles === snapshot.tiles && cachedPayloadSet) return cachedPayloadSet;

      const snapshotId = `reveal:${snapshot.tiles.length}:${Date.now()}`;
      const chunkCount = Math.max(1, Math.ceil(snapshot.tiles.length / chunkSize));
      const begin = preSerializeBroadcast({
        type: "REVEAL_MAP_BEGIN",
        snapshotId,
        totalTiles: snapshot.tiles.length,
        chunkCount
      } satisfies RevealMapBeginPayload);
      const chunks: BroadcastPayload[] = [];
      let payloadJsonBytes = begin.serialized.length;

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(snapshot.tiles.length, start + chunkSize);
        const chunkBroadcast = preSerializeBroadcast({
          type: "REVEAL_MAP_CHUNK",
          snapshotId,
          chunkIndex,
          chunkCount,
          tiles: deps.jsonSafeTileDeltaBatch(snapshot.tiles.slice(start, end))
        } satisfies RevealMapChunkPayload);
        chunks.push(chunkBroadcast);
        payloadJsonBytes += chunkBroadcast.serialized.length;
      }

      const endBroadcast = preSerializeBroadcast({
        type: "REVEAL_MAP_END",
        snapshotId
      } satisfies RevealMapEndPayload);
      payloadJsonBytes += endBroadcast.serialized.length;
      cachedTiles = snapshot.tiles;
      cachedPayloadSet = {
        snapshotId,
        totalTiles: snapshot.tiles.length,
        begin,
        chunks,
        end: endBroadcast,
        payloadJsonBytes
      };
      return cachedPayloadSet;
    },
    clear() {
      cachedTiles = undefined;
      cachedPayloadSet = undefined;
    }
  };
};
