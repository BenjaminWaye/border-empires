import type { DomainTileState } from "@border-empires/game-domain";
import type { TileOverlayJsonFields } from "@border-empires/sim-protocol";

import { TILE_OVERLAY_KEYS, overlayJsonField, type DomainOverlayKey, type TileOverlays } from "../tile-overlay-fields/tile-overlay-fields.js";
import { parseOptionalJson } from "./event-recovery-town-helpers.js";

const recoverOverlay = <K extends DomainOverlayKey>(
  out: TileOverlays,
  delta: TileOverlayJsonFields,
  existing: TileOverlays | undefined,
  key: K
): void => {
  const field = overlayJsonField(key);
  if (field in delta) {
    // Present: a JSON value sets the overlay, an empty one is an explicit
    // clear (a collected shard site, a Siphon ending, a removed structure).
    const json = delta[field];
    if (json) out[key] = parseOptionalJson<DomainTileState[K]>(json);
    return;
  }
  // Absent: this delta did not touch the overlay, so keep what was there.
  const kept = existing?.[key];
  if (kept) out[key] = kept;
};

/**
 * Replays one TILE_DELTA_BATCH tile's overlay fields onto the recovered tile,
 * for every overlay in the shared table (TILE_OVERLAY_WIRE_FIELDS). This
 * used to be one hand-written block per overlay; a missing block silently
 * dropped that overlay on restart.
 */
export const recoverOverlaySubstructures = (delta: TileOverlayJsonFields, existing: TileOverlays | undefined): TileOverlays => {
  const out: TileOverlays = {};
  for (const key of TILE_OVERLAY_KEYS) recoverOverlay(out, delta, existing, key);
  return out;
};
