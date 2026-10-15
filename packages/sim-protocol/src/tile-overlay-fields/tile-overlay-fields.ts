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
 * To add an overlay: add a row here, add the `snake` field to
 * simulation.proto, and give it a slot in the simulation's
 * tile-delta-stringify-cache.ts (AllSubstructureJson). Some places still
 * hand-list overlay fields and are NOT tied to this table yet, so the
 * compiler will not flag them -- update them by hand until they are migrated
 * (tracked in docs/code-cleanup-plan.md):
 *   - simulation: runtime-state-export.ts (toRuntimeExportTile),
 *     event-recovery/event-recovery.ts, runtime-types.ts
 *     (SimulationTileWireDelta), snapshot-tile-cache.ts (RuntimeState),
 *     simulation-service/proto-serialization.ts (proto tile types)
 *   - client: client-gateway-sync/client-gateway-sync.ts and the overlay
 *     field gate in client-network/client-network.ts
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
