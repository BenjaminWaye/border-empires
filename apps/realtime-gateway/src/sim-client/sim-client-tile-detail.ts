import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { normalizeProtoTile, type ProtoTileDelta } from "./sim-client-tile-normalize.js";

export type ProtoFetchTileDetailRequest = {
  player_id: string;
  x: number;
  y: number;
  full_visibility?: boolean;
  radius?: number;
};
export type ProtoFetchTileDetailAck = {
  ok: boolean;
  player_id?: string;
  playerId?: string;
  x?: number;
  y?: number;
  tiles?: ProtoTileDelta[];
  player_upkeep_json?: string;
  playerUpkeepJson?: string;
};
export type FetchTileDetailResult = {
  playerId: string;
  x: number;
  y: number;
  tiles: PlayerSubscriptionSnapshot["tiles"];
  upkeepLastTick?: NonNullable<PlayerSubscriptionSnapshot["player"]>["upkeepLastTick"];
};

export const parseFetchTileDetailAck = (
  response: ProtoFetchTileDetailAck,
  playerId: string,
  fallbackX: number,
  fallbackY: number
): FetchTileDetailResult => {
  const responsePlayerId =
    typeof response.player_id === "string"
      ? response.player_id
      : typeof response.playerId === "string"
        ? response.playerId
        : playerId;
  const tiles = Array.isArray(response.tiles) ? response.tiles.map((tile) => normalizeProtoTile(tile)) : [];
  const upkeepJson =
    typeof response.player_upkeep_json === "string"
      ? response.player_upkeep_json
      : typeof response.playerUpkeepJson === "string"
        ? response.playerUpkeepJson
        : undefined;
  let upkeepLastTick: FetchTileDetailResult["upkeepLastTick"];
  if (upkeepJson) {
    try {
      upkeepLastTick = JSON.parse(upkeepJson) as FetchTileDetailResult["upkeepLastTick"];
    } catch {
      upkeepLastTick = undefined;
    }
  }
  return {
    playerId: responsePlayerId,
    x: typeof response.x === "number" ? response.x : fallbackX,
    y: typeof response.y === "number" ? response.y : fallbackY,
    tiles,
    ...(upkeepLastTick ? { upkeepLastTick } : {})
  };
};
