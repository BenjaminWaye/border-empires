// A Manifest commission in flight. CHOOSE_TECH marks its tech pending until the
// server answers (TECH_UPDATE, or a TECH_* error), and every tap meanwhile is
// refused so the order isn't sent twice. An answer that never comes (a reply
// lost with a dying phone connection) or that isn't a TECH_* error (rate limit,
// queue write failure, simulation down) used to leave the commission pending
// for the rest of the session: every later Commission tap was refused silently.

import type { ClientState } from "../client-state/client-state.js";

type PendingTechState = Pick<ClientState, "pendingTechUnlockId" | "pendingTechUnlockAt" | "currentResearch">;

/** How long a commission waits for the server before a new tap may send it again. */
export const TECH_COMMISSION_PENDING_TIMEOUT_MS = 10_000;

/**
 * Errors that mean the command never reached the simulation, so no TECH_UPDATE will follow.
 * TECH_* errors are the simulation's own refusals.
 */
const COMMAND_NOT_APPLIED_CODES: ReadonlySet<string> = new Set([
  "COMMAND_RATE_LIMITED",
  "QUEUE_PERSIST_FAILED",
  "SIMULATION_UNAVAILABLE",
  "SERVER_STARTING",
  "GATEWAY_INTERNAL_ERROR",
  "BAD_COMMAND"
]);

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

/** Server ERROR handler: a refused or undelivered commission is no longer pending. */
export const clearTechCommissionOnError = (state: PendingTechState, errorCode: string): void => {
  if (!state.pendingTechUnlockId) return;
  if (!errorCode.startsWith("TECH_") && !COMMAND_NOT_APPLIED_CODES.has(errorCode)) return;
  clearTechCommissionPending(state);
  state.currentResearch = undefined;
};
