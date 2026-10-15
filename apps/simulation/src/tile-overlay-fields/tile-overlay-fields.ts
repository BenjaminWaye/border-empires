import type { DomainTileState } from "@border-empires/game-domain";

import type { SimulationTileWireDelta } from "../runtime-types.js";

/**
 * The one list of per-tile "overlay" substructures (structures, sites and
 * flags that sit on a tile alongside its terrain/ownership/town).
 *
 * Every projection that copies these off a DomainTileState derives its field
 * set from this list instead of hand-listing them:
 *   - the persisted snapshot (mapTile, runtime-snapshot-sections.ts)
 *   - the login/full-visibility export (runtime-visible-state.ts)
 *   - wire deltas (OVERLAY_JSON_FIELDS, tile-delta-overlay-fields.ts)
 *   - the gRPC boundary (OVERLAY_FIELDS, proto-overlay-fields.ts)
 *
 * Hand-listed copies drifted repeatedly: natural wonders went invisible after
 * EXPAND (#1157) and again across gRPC (#1160/#1162), active muster flags never
 * reached reconnecting clients, and AFCs were dropped from the persisted
 * snapshot so every restart re-placed them.
 *
 * To add an overlay: add its DomainTileState key here, give it a slot in
 * tile-delta-stringify-cache.ts (AllSubstructureJson), and add the matching
 * `<key>_json` field to simulation.proto. The wire field is always
 * `<key>Json` (`fort` -> `fortJson`).
 */
export const TILE_OVERLAY_KEYS = [
  "shardSite",
  "naturalWonder",
  "fort",
  "observatory",
  "siegeBattery",
  "economicStructure",
  "sabotage",
  "watchtower",
  "waystation",
  "muster",
  "afc"
] as const satisfies readonly (keyof DomainTileState)[];

export type TileOverlayKey = (typeof TILE_OVERLAY_KEYS)[number];
export type TileOverlayJsonField = `${TileOverlayKey}Json` & keyof SimulationTileWireDelta;

export const overlayJsonField = (key: TileOverlayKey): TileOverlayJsonField => `${key}Json`;

type TileOverlays = Partial<Pick<DomainTileState, TileOverlayKey>>;

const copyOverlay = <K extends TileOverlayKey>(out: TileOverlays, tile: TileOverlays, key: K): void => {
  const value = tile[key];
  if (value) out[key] = value;
};

/** The overlay substructures present on `tile`, as-is (persisted snapshot shape). */
export const overlaySubstructuresFrom = (tile: TileOverlays): TileOverlays => {
  const out: TileOverlays = {};
  for (const key of TILE_OVERLAY_KEYS) copyOverlay(out, tile, key);
  return out;
};

/**
 * The overlay substructures present on `tile`, JSON-stringified under their
 * wire names. Truthy-guarded: absent means "not there", never "cleared", so
 * this is for full-snapshot projections only. Delta builders must use
 * overlayJsonFieldsFrom (tile-delta-overlay-fields.ts), which keeps every
 * field present so subscribers can detect clears.
 */
export const overlayJsonFieldsFromTile = (tile: TileOverlays): Partial<Record<TileOverlayJsonField, string>> => {
  const out: Partial<Record<TileOverlayJsonField, string>> = {};
  for (const key of TILE_OVERLAY_KEYS) {
    const value = tile[key];
    if (value) out[overlayJsonField(key)] = JSON.stringify(value);
  }
  return out;
};

type TownWireFields = Pick<SimulationTileWireDelta, "townJson" | "townType" | "townName" | "townPopulationTier">;

/** Wire projection of a tile's town: the full JSON plus the flattened scalars clients filter on. */
export const townWireFields = (town: DomainTileState["town"]): TownWireFields =>
  town
    ? {
        townJson: JSON.stringify(town),
        ...(town.type ? { townType: town.type } : {}),
        ...(town.name ? { townName: town.name } : {}),
        ...(town.populationTier ? { townPopulationTier: town.populationTier } : {})
      }
    : {};
