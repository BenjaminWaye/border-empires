// Client-side Empire Integrity percentage, used only when a message doesn't
// carry the server's authoritative integrityPct. Must match the server's
// empireIntegrity() -- including the new-empire grace floor. It used to call
// defensivenessMultiplier (the raw shape score, no grace), so any partial
// PLAYER_UPDATE (profile/colour change, auto-settle toggle, ability/map
// command) recomputed a ~20-tile empire down to ~80% even though the server
// held it at 90%+ (playtest report).

import { empireIntegrity } from "@border-empires/shared";

/** Integrity 0-100 from settled tile/exposure counts, or `fallback` when either count is unknown. */
export const integrityPctFromSettledCounts = (t: number | undefined, e: number | undefined, fallback: number): number => {
  if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return fallback;
  return Math.max(0, Math.min(100, empireIntegrity(t, e) * 100));
};

/**
 * Integrity 0-100 after a PLAYER_UPDATE. Partial updates (profile/colour,
 * auto-settle prefs, ability/map commands) carry none of integrityPct/Ts/Es
 * and leave it unchanged; otherwise the server's integrityPct wins, falling
 * back to recomputing from settled counts.
 */
export const integrityPctFromPlayerUpdate = (
  msg: { readonly integrityPct?: unknown; readonly Ts?: unknown; readonly Es?: unknown },
  current: number,
  fromSettledCounts: () => number
): number => {
  if (!("integrityPct" in msg) && !("Ts" in msg) && !("Es" in msg)) return current;
  if (typeof msg.integrityPct === "number" && Number.isFinite(msg.integrityPct)) return Math.max(0, Math.min(100, msg.integrityPct));
  return fromSettledCounts();
};
