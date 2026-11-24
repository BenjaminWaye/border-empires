// PLAYER_UPDATE handling for Empire Integrity, extracted from
// client-network.ts (far past the 500-line cap): pick the new value (partial
// updates leave it alone -- see integrityPctFromPlayerUpdate), re-arm the
// low-integrity warning once it has recovered, and drive the HUD's up/down
// change animation.

import type { ClientState } from "../client-state/client-state.js";
import { integrityPctFromPlayerUpdate, integrityPctFromSettledCounts } from "./client-integrity-pct.js";

type IntegrityState = Pick<
  ClientState,
  "defensibilityPct" | "defensibilityAnimUntil" | "defensibilityAnimDir" | "ownedT" | "settledT" | "settledE"
>;

const ANIM_MS = 550;
const ANIM_THRESHOLD_PCT = 0.05;

/**
 * `state.settledT`/`settledE` already hold this update's Ts/Es; `msg.T` (owned land tiles) is kept here, so the panel
 * and the fallback recompute read the same counts as the server's empireIntegrity(T, Es, Ts).
 */
export const applyPlayerUpdateIntegrity = (
  state: IntegrityState,
  msg: { readonly integrityPct?: unknown; readonly T?: unknown; readonly Ts?: unknown; readonly Es?: unknown },
  previousPct: number,
  nowMs: number = Date.now()
): void => {
  if (typeof msg.T === "number" && Number.isFinite(msg.T)) state.ownedT = msg.T;
  state.defensibilityPct = integrityPctFromPlayerUpdate(msg, state.defensibilityPct, () =>
    integrityPctFromSettledCounts(state.ownedT, state.settledE, state.defensibilityPct, state.settledT));
  if (state.defensibilityPct > previousPct + ANIM_THRESHOLD_PCT) {
    state.defensibilityAnimUntil = nowMs + ANIM_MS;
    state.defensibilityAnimDir = 1;
  } else if (state.defensibilityPct < previousPct - ANIM_THRESHOLD_PCT) {
    state.defensibilityAnimUntil = nowMs + ANIM_MS;
    state.defensibilityAnimDir = -1;
  } else if (nowMs >= state.defensibilityAnimUntil) {
    state.defensibilityAnimDir = 0;
  }
};
