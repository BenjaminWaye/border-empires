import type { DomainTileState } from "@border-empires/game-domain";
import { TILE_OVERLAY_WIRE_FIELDS, type TileOverlayKey as WireTileOverlayKey } from "@border-empires/sim-protocol";

import type { SimulationTileWireDelta } from "../runtime-types.js";

/**
 * The simulation's view of the shared overlay table (TILE_OVERLAY_WIRE_FIELDS
 * in @border-empires/sim-protocol -- add new overlays there, not here).
 *
 * Every projection that copies overlays off a DomainTileState derives its
 * field set from this list instead of hand-listing them:
 *   - the persisted snapshot (mapTile, runtime-snapshot-sections.ts)
 *   - the login/full-visibility export (runtime-visible-state.ts)
 *   - wire deltas (OVERLAY_JSON_FIELDS, tile-delta-overlay-fields.ts)
 *   - the gRPC boundary (OVERLAY_FIELDS, proto-overlay-fields.ts)
 *
 * TileOverlayKey intersects the wire keys with DomainTileState's own keys,
 * so a wire row without a matching tile field fails to compile here.
 */
export type TileOverlayKey = WireTileOverlayKey & keyof DomainTileState;
export const TILE_OVERLAY_KEYS: readonly TileOverlayKey[] = TILE_OVERLAY_WIRE_FIELDS.map((field) => field.key);
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
