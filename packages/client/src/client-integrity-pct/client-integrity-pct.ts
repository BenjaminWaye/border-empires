// Client-side Empire Integrity percentage, used only when a message doesn't
// carry the server's authoritative integrityPct. Must match the server's
// empireIntegrity() -- including the new-empire grace floor. It used to call
// defensivenessMultiplier (the raw shape score, no grace), so any partial
// PLAYER_UPDATE (profile/colour change, auto-settle toggle, ability/map
// command) recomputed a ~20-tile empire down to ~80% even though the server
// held it at 90%+ (playtest report). client-network.ts's PLAYER_UPDATE
// handler now also leaves integrity alone on updates that carry none of
// integrityPct/Ts/Es.

import { empireIntegrity } from "@border-empires/shared";

/** Integrity 0-100 from settled tile/exposure counts, or `fallback` when either count is unknown. */
export const integrityPctFromSettledCounts = (t: number | undefined, e: number | undefined, fallback: number): number => {
  if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return fallback;
  return Math.max(0, Math.min(100, empireIntegrity(t, e) * 100));
};
