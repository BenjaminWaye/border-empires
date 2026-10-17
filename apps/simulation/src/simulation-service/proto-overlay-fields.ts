import {
  TILE_OVERLAY_WIRE_FIELDS,
  type TileOverlayJsonFields,
  type TileOverlayProtoField
} from "@border-empires/sim-protocol";

/**
 * The tile "overlay" JSON fields (fort, natural wonder, shard site, ...)
 * that proto-serialization.ts has to carry across
 * the sim -> gateway gRPC boundary, in every shape that boundary needs:
 * the snake_case proto array (tile_deltas, clear-signaling via `?? ""`),
 * the camelCase convenience array (tileDeltas, clear-signaling, no
 * coercion), and the full-snapshot serializer (toFullSnapshotProtoTile,
 * truthy-guard, no clear-signaling -- see the comment above
 * toFullSnapshotProtoTile for why that path can't reuse the clear-signaling
 * helpers).
 *
 * Forgetting a field in one of proto-serialization.ts's four field-listing
 * spots is the exact bug that made natural wonders invisible even after the
 * in-process wire-delta builder was fixed (#1160/#1162): the field reached
 * SimulationTileWireDelta correctly, but proto-serialization.ts's hand-listed
 * mappings never carried it across the gRPC boundary to the gateway.
 *
 * The helpers below iterate TILE_OVERLAY_WIRE_FIELDS from
 * @border-empires/sim-protocol, the table the gateway also decodes with, so
 * no caller in proto-serialization.ts changes when an overlay is added.
 */
type ProtoOverlayStrings = { [F in TileOverlayProtoField]?: string };

/** TILE_DELTA_BATCH snake_case array: present key means "touched this delta", `?? ""` signals an explicit clear. */
export const overlaySnakeClearFields = (tile: TileOverlayJsonFields): ProtoOverlayStrings => {
  const out: ProtoOverlayStrings = {};
  for (const { camel, snake } of TILE_OVERLAY_WIRE_FIELDS) {
    if (camel in tile) out[snake] = tile[camel] ?? "";
  }
  return out;
};

/** TILE_DELTA_BATCH camelCase array: same clear-signaling contract, no `?? ""` coercion (JSON-native, not proto3). */
export const overlayCamelClearFields = (tile: TileOverlayJsonFields): TileOverlayJsonFields => {
  const out: TileOverlayJsonFields = {};
  for (const { camel } of TILE_OVERLAY_WIRE_FIELDS) {
    if (camel in tile) out[camel] = tile[camel];
  }
  return out;
};

/** Full-snapshot serializer: truthy-guard only, no clear-signaling (see toFullSnapshotProtoTile's comment). */
export const overlaySnakeTruthyFields = (tile: TileOverlayJsonFields): ProtoOverlayStrings => {
  const out: ProtoOverlayStrings = {};
  for (const { camel, snake } of TILE_OVERLAY_WIRE_FIELDS) {
    const value = tile[camel];
    if (value) out[snake] = value;
  }
  return out;
};
