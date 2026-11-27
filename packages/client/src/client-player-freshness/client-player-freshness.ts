// Stale header on load (playtest 2026-11-27: old food and Integrity for ~5 s
// after every load). The INIT player block carries no integrityPct (the
// gateway never sets it, so initDefensibilityPct kept the client default of
// 100 or the previous session's value) and its resourceSlots can come from a
// cached subscribe snapshot. The first full PLAYER_UPDATE (the only message
// carrying the server's integrityPct, emitPlayerStateUpdate) brings both
// fresh. Until it arrives, or PLAYER_FRESH_WAIT_MS passes, the top bar shows
// "…" for the slot and Integrity chips instead of the old numbers.

import type { ClientState } from "../client-state/client-state.js";
import { resetIntegrityDropTracking } from "../client-integrity-drop/client-integrity-drop-notice.js";

export const PLAYER_FRESH_WAIT_MS = 15_000;

type FreshnessState = Pick<ClientState, "awaitingFreshPlayerUntil">;

/** On INIT: hold the food/Integrity chips, and start Integrity drop tracking afresh. */
export const markAwaitingFreshPlayer = (state: FreshnessState, nowMs: number = Date.now()): void => {
  state.awaitingFreshPlayerUntil = nowMs + PLAYER_FRESH_WAIT_MS;
  resetIntegrityDropTracking();
};

/** On PLAYER_UPDATE: a full update (with integrityPct) ends the wait. */
export const notePlayerUpdateFreshness = (state: FreshnessState, msg: { readonly integrityPct?: unknown }): void => {
  if (typeof msg.integrityPct === "number" && Number.isFinite(msg.integrityPct)) state.awaitingFreshPlayerUntil = 0;
};

export const isAwaitingFreshPlayer = (state: FreshnessState, nowMs: number = Date.now()): boolean => state.awaitingFreshPlayerUntil > nowMs;
