import type { ClientState } from "../client-state/client-state.js";
import type { FeedSeverity, FeedType } from "../client-types.js";
import { markProfileChangeUsed } from "../client-profile-change-allowance/client-profile-change-allowance.js";

// Settings > Account > Edit Name & Colour used to close the moment SET_PROFILE
// was sent, so the server's answer landed only in the (admin-only) feed or a
// blocked window.alert: a refused rename looked like "the dialog closed and
// nothing happened" (2026-11 playtest). The modal now waits here for the
// answer: PLAYER_UPDATE confirming the change, or the ERROR refusing it.

export type ProfileEditOutcome = { ok: true } | { ok: false; reason: string };

let waiter: ((outcome: ProfileEditOutcome) => void) | undefined;
let waiterTimer: ReturnType<typeof setTimeout> | undefined;

const clearWaiter = (): void => {
  if (waiterTimer !== undefined) clearTimeout(waiterTimer);
  waiterTimer = undefined;
  waiter = undefined;
};

/** The modal's reason when the server never answers. */
export const PROFILE_EDIT_NO_REPLY = "No reply. Try again.";

/** Waits for the server's answer to a profile save. Returns a cancel function (the modal closed). */
export const awaitProfileEditOutcome = (onOutcome: (outcome: ProfileEditOutcome) => void, timeoutMs = 15_000): (() => void) => {
  clearWaiter();
  const own = (outcome: ProfileEditOutcome): void => {
    if (waiter !== own) return;
    clearWaiter();
    onOutcome(outcome);
  };
  waiter = own;
  waiterTimer = setTimeout(() => own({ ok: false, reason: PROFILE_EDIT_NO_REPLY }), timeoutMs);
  return () => {
    if (waiter === own) clearWaiter();
  };
};

/** Delivers the server's answer to a waiting profile save, if any. */
export const settleProfileEditOutcome = (outcome: ProfileEditOutcome): void => {
  waiter?.(outcome);
};

/** True while a pending name or colour change still has no confirmation. */
const profileChangeStillPending = (state: Pick<ClientState, "pendingDisplayNameChange" | "pendingColorChange">): boolean =>
  Boolean(state.pendingDisplayNameChange || state.pendingColorChange);

/** Call after a PLAYER_UPDATE confirmed (and cleared) a pending change: resolves the wait once nothing is left pending. */
export const settleProfileEditIfConfirmed = (state: Pick<ClientState, "pendingDisplayNameChange" | "pendingColorChange">): void => {
  if (!profileChangeStillPending(state)) settleProfileEditOutcome({ ok: true });
};

/** PLAYER_UPDATE's own tile colour: confirms a pending colour change. */
export const applyPlayerUpdateColorChange = (
  tileColor: string,
  deps: {
    state: Pick<ClientState, "me" | "playerColors" | "pendingDisplayNameChange" | "pendingColorChange">;
    authProfileColorEl: { value: string };
    pushFeed: (message: string, type?: FeedType, severity?: FeedSeverity) => void;
  }
): void => {
  const { state } = deps;
  state.playerColors.set(state.me, tileColor);
  deps.authProfileColorEl.value = tileColor;
  if (state.pendingColorChange && state.pendingColorChange === tileColor) {
    state.pendingColorChange = "";
    deps.pushFeed("Empire colour updated.", "info", "success");
    settleProfileEditIfConfirmed(state);
  }
};

const PROFILE_REJECTION_CODES = new Set(["COLOR_TAKEN", "COLOR_INVALID", "DISPLAY_NAME_LIMIT", "COLOR_LIMIT", "GATEWAY_INTERNAL_ERROR", "BAD_MSG"]);

/**
 * SET_PROFILE refusals other than NAME_TAKEN (client-display-name-taken.ts).
 * A rename and a recolour ride on the same message, so a refusal means
 * neither was saved: both pending changes are cleared, the reason goes to the
 * feed (mirrored onto the alert card) and to the waiting modal.
 * Returns true when the error was fully handled here.
 */
export const applyProfileSaveRejection = (
  deps: {
    state: Pick<ClientState, "me" | "playerColors" | "pendingDisplayNameChange" | "pendingColorChange">;
    authProfileColorEl: { value: string };
    setAuthStatus: (message: string, tone?: "normal" | "error") => void;
    syncAuthOverlay: () => void;
    pushFeed: (message: string, type?: FeedType, severity?: FeedSeverity) => void;
  },
  errorCode: string,
  msg: { message?: unknown; suggestion?: unknown }
): boolean => {
  if (!PROFILE_REJECTION_CODES.has(errorCode)) return false;
  const { state } = deps;
  const base = typeof msg.message === "string" && msg.message ? msg.message : "Not saved.";
  const suggestion = typeof msg.suggestion === "string" && msg.suggestion ? msg.suggestion : undefined;
  const reason = `${base}${suggestion ? ` Try: ${suggestion}` : ""}`;
  // BAD_MSG / internal errors are generic: only ours when a profile save is pending.
  const generic = errorCode === "GATEWAY_INTERNAL_ERROR" || errorCode === "BAD_MSG";
  const pending = profileChangeStillPending(state);
  if (generic && !pending) return false;
  if (errorCode === "COLOR_TAKEN" || errorCode === "COLOR_INVALID") {
    deps.authProfileColorEl.value = state.playerColors.get(state.me) ?? deps.authProfileColorEl.value;
    deps.setAuthStatus(reason, "error");
    deps.syncAuthOverlay();
  }
  const shownReason = errorCode === "BAD_MSG" ? "Name not accepted." : reason;
  // The once-per-contest refusals already name what was refused.
  if (errorCode === "DISPLAY_NAME_LIMIT" || errorCode === "COLOR_LIMIT") {
    markProfileChangeUsed(errorCode === "COLOR_LIMIT" ? "color" : "name");
    deps.pushFeed(shownReason, "error", "warn");
  }
  else if (state.pendingDisplayNameChange) deps.pushFeed(`Display name not updated: ${shownReason}`, "error", "error");
  else if (state.pendingColorChange) deps.pushFeed(`Empire colour not updated: ${shownReason}`, "error", "error");
  else deps.pushFeed(shownReason, "error", "warn");
  state.pendingDisplayNameChange = "";
  state.pendingColorChange = "";
  settleProfileEditOutcome({ ok: false, reason: shownReason });
  // Generic errors still flow on to the generic handler.
  return !generic;
};
