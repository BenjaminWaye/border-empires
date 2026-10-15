import { TILE_OVERLAY_KEYS, overlayJsonField } from "../tile-overlay-fields/tile-overlay-fields.js";

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
 * Derived from TILE_OVERLAY_KEYS (tile-overlay-fields.ts): the camelCase wire
 * name is `<key>Json`, the proto field is its snake_case form
 * (`siegeBattery` -> `siege_battery_json`). No caller in
 * proto-serialization.ts needs to change when an overlay is added.
 */
const snakeCase = (camel: string): string => camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const OVERLAY_FIELDS: ReadonlyArray<{ camel: string; snake: string }> = TILE_OVERLAY_KEYS.map((key) => ({
  camel: overlayJsonField(key),
  snake: `${snakeCase(key)}_json`
}));

type TileLike = Record<string, unknown>;

/** TILE_DELTA_BATCH snake_case array: present key means "touched this delta", `?? ""` signals an explicit clear. */
export const overlaySnakeClearFields = (tile: TileLike): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const { camel, snake } of OVERLAY_FIELDS) {
    if (camel in tile) out[snake] = (tile[camel] as string | undefined) ?? "";
  }
  return out;
};

/** TILE_DELTA_BATCH camelCase array: same clear-signaling contract, no `?? ""` coercion (JSON-native, not proto3). */
export const overlayCamelClearFields = (tile: TileLike): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const { camel } of OVERLAY_FIELDS) {
    if (camel in tile) out[camel] = tile[camel] as string | undefined;
  }
  return out;
};

/** Full-snapshot serializer: truthy-guard only, no clear-signaling (see toFullSnapshotProtoTile's comment). */
export const overlaySnakeTruthyFields = (tile: TileLike): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const { camel, snake } of OVERLAY_FIELDS) {
    const value = tile[camel] as string | undefined;
    if (value) out[snake] = value;
  }
  return out;
};
