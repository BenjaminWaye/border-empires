// PLAYER_UPDATE handling for Empire Integrity, extracted from
// client-network.ts (far past the 500-line cap): pick the new value (partial
// updates leave it alone -- see integrityPctFromPlayerUpdate), re-arm the
// low-integrity warning once it has recovered, and drive the HUD's up/down
// change animation.

import type { ClientState } from "../client-state/client-state.js";
import { resetIntegrityWarningIfRecovered } from "../client-hud/client-integrity-warning-storage.js";
import { integrityPctFromPlayerUpdate } from "./client-integrity-pct.js";

type IntegrityState = Pick<
  ClientState,
  "defensibilityPct" | "authEmail" | "integrityWarningDismissed" | "defensibilityAnimUntil" | "defensibilityAnimDir"
>;

const ANIM_MS = 550;
const ANIM_THRESHOLD_PCT = 0.05;

export const applyPlayerUpdateIntegrity = (
  state: IntegrityState,
  msg: { readonly integrityPct?: unknown; readonly Ts?: unknown; readonly Es?: unknown },
  previousPct: number,
  fromSettledCounts: () => number,
  nowMs: number = Date.now()
): void => {
  state.defensibilityPct = integrityPctFromPlayerUpdate(msg, state.defensibilityPct, fromSettledCounts);
  if (resetIntegrityWarningIfRecovered(state.defensibilityPct, state.authEmail)) state.integrityWarningDismissed = false;
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
