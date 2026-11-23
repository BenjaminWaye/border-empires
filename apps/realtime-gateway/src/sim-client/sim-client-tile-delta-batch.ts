import { normalizeProtoTile, type ProtoTileDelta, type SimClientTileDelta } from "./sim-client-tile-normalize.js";

// Decodes a simulation TILE_DELTA_BATCH event. Extracted from sim-client.ts,
// which is over the repo's 500-line file gate and may not grow.

/** The raw proto fields a TILE_DELTA_BATCH event carries. */
export type ProtoTileDeltaBatchEvent = {
  command_id: string;
  player_id: string;
  tile_deltas?: ProtoTileDelta[];
  tile_delta_json?: string;
  tileDeltaJson?: string;
  message_type?: string;
};

export type DecodedTileDeltaBatchEvent = {
  eventType: "TILE_DELTA_BATCH";
  commandId: string;
  playerId: string;
  tileDeltas: SimClientTileDelta[];
  /** The simulation's unfiltered copy for a revealed (spectating) player; see tile-delta-fanout-filter.ts. */
  spectator?: true;
};

const parseJsonTileDeltas = (json: string): SimClientTileDelta[] => {
  if (!json) return [];
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is ProtoTileDelta => Boolean(item) && typeof item === "object" && typeof (item as ProtoTileDelta).x === "number" && typeof (item as ProtoTileDelta).y === "number")
    .map((tile) => normalizeProtoTile(tile));
};

export const decodeTileDeltaBatchEvent = (event: ProtoTileDeltaBatchEvent): DecodedTileDeltaBatchEvent => {
  const tileDeltas =
    Array.isArray(event.tile_deltas) && event.tile_deltas.length > 0
      ? event.tile_deltas.map((tile) => normalizeProtoTile(tile))
      : parseJsonTileDeltas(event.tileDeltaJson || event.tile_delta_json || "");
  return {
    eventType: "TILE_DELTA_BATCH",
    commandId: event.command_id,
    playerId: event.player_id,
    tileDeltas,
    ...(event.message_type === "SPECTATOR" ? { spectator: true as const } : {})
  };
};
