// A Manifest commission in flight. CHOOSE_TECH marks its tech pending until the
// server answers (TECH_UPDATE, or a TECH_* error), and every tap meanwhile is
// refused so the order isn't sent twice. A reconnect's INIT also clears it. A
// CHOOSE_TECH the gateway turns away before the simulation sees it (rate limit,
// queue write failure) gets no TECH_* answer, and its error can't be matched to
// the commission (the gateway gives CHOOSE_TECH its own command id), so it used
// to stay pending for the rest of the connection: every later Commission tap was
// refused silently. The pending state now ends after a timeout long enough that
// a lagging simulation answers first.

import type { ClientState } from "../client-state/client-state.js";

type PendingTechState = Pick<ClientState, "pendingTechUnlockId" | "pendingTechUnlockAt" | "currentResearch">;

/** How long a commission waits for the server before a new tap may send it again. */
export const TECH_COMMISSION_PENDING_TIMEOUT_MS = 30_000;

export const markTechCommissionPending = (state: PendingTechState, techId: string, nowMs: number): void => {
  state.pendingTechUnlockId = techId;
  state.pendingTechUnlockAt = nowMs;
};

export const clearTechCommissionPending = (state: PendingTechState): void => {
  state.pendingTechUnlockId = "";
  state.pendingTechUnlockAt = 0;
};

/** The tech still waiting for the server, or "" once nothing is pending or the wait has run out. */
export const pendingTechCommissionId = (state: PendingTechState, nowMs: number): string => {
  if (!state.pendingTechUnlockId) return "";
  return nowMs - state.pendingTechUnlockAt < TECH_COMMISSION_PENDING_TIMEOUT_MS ? state.pendingTechUnlockId : "";
};

/** Drops a commission whose wait has run out, so every reader of pendingTechUnlockId (legacy panel, picker) frees up too. */
export const expireStaleTechCommission = (state: PendingTechState, nowMs: number): void => {
  if (state.pendingTechUnlockId && !pendingTechCommissionId(state, nowMs)) clearTechCommissionPending(state);
};

/**
 * Server ERROR handler: the simulation refused the commission (a TECH_* error). Other codes (rate limit, BAD_COMMAND,
 * SIMULATION_UNAVAILABLE) can't be tied to CHOOSE_TECH, and the last can follow a command the simulation still applies,
 * so they leave it pending.
 */
export const clearTechCommissionOnError = (state: PendingTechState, errorCode: string): void => {
  if (!state.pendingTechUnlockId || !errorCode.startsWith("TECH_")) return;
  clearTechCommissionPending(state);
  state.currentResearch = undefined;
};
