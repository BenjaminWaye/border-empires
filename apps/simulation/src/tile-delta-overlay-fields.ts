import type { AllSubstructureJson } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import { TILE_OVERLAY_KEYS, overlayJsonField } from "./tile-overlay-fields/tile-overlay-fields.js";

type OverlayFieldName = keyof AllSubstructureJson & keyof SimulationTileWireDelta;

/**
 * Which "overlay" substructure JSON fields (fort, natural wonder, shard
 * site, ...) belong on a tile wire delta, and how they are copied onto it.
 *
 * Both tileDeltaFromState (command-triggered deltas, runtime-tile-delta-from-state.ts)
 * and tileDeltaRevealOnly (fog-of-war reveal deltas, tile-delta-reveal-only.ts)
 * spread this table instead of hand-listing every field. Forgetting a field
 * in one of those two places is the exact bug that made natural wonders
 * invisible after EXPAND (#1157): tile-delta-stringify-cache.ts computed
 * naturalWonderJson correctly, but tileDeltaFromState's object literal never
 * read it.
 *
 * Every field here is ALWAYS present on the returned object, even as
 * `undefined`, so downstream consumers (event-recovery.ts, proto-serialization.ts,
 * ai/planner-tile-delta-merge.ts, ...) can use `"xJson" in delta` to tell
 * "this delta touched the field" (present, possibly undefined = explicit
 * clear -- e.g. a shard site collected, see runtime-shard-rain-tick.ts)
 * apart from "field untouched since the subscriber's last update" (absent).
 * Omitting a falsy field instead of including it as `undefined` silently
 * breaks clear-detection for that field -- do not special-case a field to
 * skip this.
 *
 * The field list is derived from TILE_OVERLAY_KEYS (tile-overlay-fields.ts);
 * see that file for how to add a new overlay. The OverlayFieldName type makes
 * a key without a tile-delta-stringify-cache.ts slot a compile error here.
 */
export const OVERLAY_JSON_FIELDS: readonly OverlayFieldName[] = TILE_OVERLAY_KEYS.map(overlayJsonField);

export const overlayJsonFieldsFrom = (
  cached: AllSubstructureJson
): Pick<SimulationTileWireDelta, OverlayFieldName> => {
  const out: Record<string, string | undefined> = {};
  for (const field of OVERLAY_JSON_FIELDS) {
    out[field] = cached[field];
  }
  return out as Pick<SimulationTileWireDelta, OverlayFieldName>;
};
