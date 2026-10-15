/**
 * The one wire table for per-tile "overlay" substructures (fort, muster,
 * AFC, natural wonder, ...), shared by both sides of the sim <-> gateway
 * boundary:
 *   - `key`:   the DomainTileState / snapshot field (`siegeBattery`)
 *   - `camel`: the JSON wire field on tile deltas and snapshots (`siegeBatteryJson`)
 *   - `snake`: the simulation.proto field (`siege_battery_json`)
 *
 * The simulation derives its persistence, login-export, delta and proto
 * field lists from this table; the gateway derives its proto normalizer and
 * clear-signaling from it. Hand-maintained copies of this list drifted
 * repeatedly (natural wonders invisible after EXPAND and again across gRPC,
 * muster flags missing on reconnect, AFCs dropped from the persisted
 * snapshot).
 *
 * To add an overlay:
 *   1. add a row here and the `snake` field to simulation.proto
 *      (tile-overlay-fields.test.ts checks they match);
 *   2. give it a slot in the simulation's tile-delta-stringify-cache.ts
 *      (AllSubstructureJson) -- OVERLAY_JSON_FIELDS fails to compile until
 *      you do;
 *   3. add a parser to GATEWAY_OVERLAY_PARSERS in the client's
 *      client-gateway-sync.ts -- the client cannot import this package at
 *      build time, so its client-gateway-overlay-fields.test.ts fails until
 *      you do.
 * Everything else (persistence, event recovery, the full-world and login
 * exports, wire types, the proto serializer and the gateway decoder) is
 * derived from this table.
 */
export const TILE_OVERLAY_WIRE_FIELDS = [
  { key: "shardSite", camel: "shardSiteJson", snake: "shard_site_json" },
  { key: "naturalWonder", camel: "naturalWonderJson", snake: "natural_wonder_json" },
  { key: "fort", camel: "fortJson", snake: "fort_json" },
  { key: "observatory", camel: "observatoryJson", snake: "observatory_json" },
  { key: "siegeBattery", camel: "siegeBatteryJson", snake: "siege_battery_json" },
  { key: "economicStructure", camel: "economicStructureJson", snake: "economic_structure_json" },
  { key: "sabotage", camel: "sabotageJson", snake: "sabotage_json" },
  { key: "watchtower", camel: "watchtowerJson", snake: "watchtower_json" },
  { key: "waystation", camel: "waystationJson", snake: "waystation_json" },
  { key: "muster", camel: "musterJson", snake: "muster_json" },
  { key: "afc", camel: "afcJson", snake: "afc_json" }
] as const;

export type TileOverlayWireField = (typeof TILE_OVERLAY_WIRE_FIELDS)[number];
export type TileOverlayKey = TileOverlayWireField["key"];
export type TileOverlayJsonField = TileOverlayWireField["camel"];
export type TileOverlayProtoField = TileOverlayWireField["snake"];

/** The overlay JSON fields as optional tile properties (absent, a JSON string, or an explicit `undefined` clear). */
export type TileOverlayJsonFields = { [F in TileOverlayJsonField]?: string | undefined };

/** The overlay proto fields as optional snake_case tile properties (simulation.proto shape). */
export type TileOverlayProtoFields = { [F in TileOverlayProtoField]?: string | undefined };
