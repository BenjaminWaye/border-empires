import type { AllSubstructureJson } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

type OverlayFieldName = keyof AllSubstructureJson & keyof SimulationTileWireDelta;

/**
 * Single source of truth for which "overlay" substructure JSON fields
 * (fort, natural wonder, shard site, ...) belong on a tile wire delta.
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
 * To add a new overlay field:
 *   1. Give it an Entry/getOrComputeAll/buildSparseDelta/setLastEmitted/
 *      invalidate slot in tile-delta-stringify-cache.ts (same shape as
 *      naturalWonderJson there).
 *   2. Add its field name to OVERLAY_JSON_FIELDS below.
 * No delta-building call site needs to change.
 */
export const OVERLAY_JSON_FIELDS: readonly OverlayFieldName[] = [
  "shardSiteJson",
  "naturalWonderJson",
  "fortJson",
  "observatoryJson",
  "siegeOutpostJson",
  "economicStructureJson",
  "sabotageJson",
  "musterJson"
];

export const overlayJsonFieldsFrom = (
  cached: AllSubstructureJson
): Pick<SimulationTileWireDelta, OverlayFieldName> => {
  const out: Record<string, string | undefined> = {};
  for (const field of OVERLAY_JSON_FIELDS) {
    out[field] = cached[field];
  }
  return out as Pick<SimulationTileWireDelta, OverlayFieldName>;
};
