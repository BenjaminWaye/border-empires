import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type TilePayload = Array<Record<string, unknown>>;
type ReplacementPayload = { type: "TILE_SNAPSHOT_REPLACE"; tiles: TilePayload };

type FullVisibilityReplacementPayloadCacheDeps = {
  jsonSafeTileDeltaBatch: (
    tileDeltas: Array<NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>>
  ) => TilePayload;
  jsonByteSize: (value: unknown) => number;
};

type FullVisibilityReplacementPayloadCache = {
  get: (snapshot: PlayerSubscriptionSnapshot) => { payload: ReplacementPayload; payloadJsonBytes: number };
  clear: () => void;
};

export const createFullVisibilityReplacementPayloadCache = (
  deps: FullVisibilityReplacementPayloadCacheDeps
): FullVisibilityReplacementPayloadCache => {
  let cachedTiles: PlayerSubscriptionSnapshot["tiles"] | undefined;
  let cachedPayload: ReplacementPayload | undefined;
  let cachedPayloadJsonBytes = 0;

  return {
    get(snapshot) {
      if (cachedTiles === snapshot.tiles && cachedPayload) {
        return {
          payload: cachedPayload,
          payloadJsonBytes: cachedPayloadJsonBytes
        };
      }
      const payload: ReplacementPayload = {
        type: "TILE_SNAPSHOT_REPLACE",
        tiles: deps.jsonSafeTileDeltaBatch(snapshot.tiles)
      };
      cachedTiles = snapshot.tiles;
      cachedPayload = payload;
      cachedPayloadJsonBytes = deps.jsonByteSize(payload);
      return {
        payload,
        payloadJsonBytes: cachedPayloadJsonBytes
      };
    },
    clear() {
      cachedTiles = undefined;
      cachedPayload = undefined;
      cachedPayloadJsonBytes = 0;
    }
  };
};
