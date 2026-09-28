import { signInAnonymously, signOut, type Auth, type UserCredential } from "firebase/auth";

import { logGuestStart } from "../client-auth-flow/client-auth-flow-analytics.js";
import { safeLocalStorageGet, safeLocalStorageSet } from "../client-safe-storage/client-safe-storage.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Analytics } from "firebase/analytics";

// Set once a real (non-guest) account signs in on this browser. A visitor who
// has one probably wants to sign in, not start a second, throwaway empire, so
// "Play now" is shown as the secondary button for them (it is never hidden).
const RETURNING_ACCOUNT_KEY = "be_returning_account";

export const markReturningAccount = (): void => safeLocalStorageSet(RETURNING_ACCOUNT_KEY, "1");
export const hasReturningAccount = (): boolean => safeLocalStorageGet(RETURNING_ACCOUNT_KEY) === "1";

export const syncPlayNowEmphasis = (playNowBtn: HTMLElement): void => {
  playNowBtn.dataset.emphasis = hasReturningAccount() ? "secondary" : "primary";
};

type GuestPlayState = Pick<ClientState, "authBusy" | "authBusyStartedAt" | "authBusyTitle" | "authBusyDetail" | "authConfigured">;

export type GuestPlayDeps = {
  state: GuestPlayState;
  firebaseAuth: Auth | undefined;
  analytics: Analytics | undefined;
  setAuthBusy: (busy: boolean) => void;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthOverlay: () => void;
};

// "Play now": an anonymous Firebase sign-in, then the ordinary flow takes
// over (onAuthStateChanged -> socket AUTH -> INIT -> join). Deliberately not
// blocked inside in-app browsers (Instagram, TikTok, Discord): unlike Google
// sign-in it needs no popup, and that is where rally links get opened. Never
// logs a sign_up conversion; that event means a real account.
export const startGuestPlay = async (deps: GuestPlayDeps): Promise<void> => {
  const { state, firebaseAuth, analytics, setAuthBusy, setAuthStatus, syncAuthOverlay } = deps;
  if (!firebaseAuth || state.authBusy) return;
  setAuthBusy(true);
  state.authBusyTitle = "Starting your empire...";
  state.authBusyDetail = "Setting up a guest session.";
  setAuthStatus("Starting your empire...");
  syncAuthOverlay();
  let signedIn = false;
  try {
    const credential: UserCredential = await signInAnonymously(firebaseAuth);
    logGuestStart(analytics, credential);
    signedIn = true;
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Could not start a guest session.", "error");
  } finally {
    // On success onAuthStateChanged owns the busy state from here on.
    if (!signedIn) setAuthBusy(false);
    syncAuthOverlay();
  }
};

export const bindGuestPlay = (deps: GuestPlayDeps & { playNowBtn: HTMLButtonElement }): void => {
  syncPlayNowEmphasis(deps.playNowBtn);
  deps.playNowBtn.onclick = () => {
    void startGuestPlay(deps);
  };
};

const GUEST_SEASON_FULL_MESSAGE = "This season is full. Sign in with an account and we'll email you when the next one starts.";

type GuestRejectionState = Pick<
  ClientState,
  "authIsGuest" | "authSessionReady" | "authRetrying" | "joinSeasonPending" | "needsSeasonJoin" | "joinSeasonOverlayOpen"
>;

// A guest was turned away (guest spots full, or the whole season is full).
// Signing in with a real account is the way forward in both cases, so sign the
// guest out and show the sign-in options with the reason: no busy modal, no
// dead end. Only ever acts on a guest, so a stray error can never sign a real
// account out.
export const applyGuestRejection = async (
  deps: {
    state: GuestRejectionState;
    firebaseAuth: Auth | undefined;
    setAuthStatus: (message: string, tone?: "normal" | "error") => void;
    syncAuthOverlay: () => void;
  },
  code: "GUEST_SLOTS_FULL" | "SEASON_FULL",
  serverMessage: string
): Promise<void> => {
  const { state, firebaseAuth, setAuthStatus, syncAuthOverlay } = deps;
  if (!state.authIsGuest) return;
  state.authIsGuest = false;
  state.authSessionReady = false;
  state.authRetrying = false;
  state.joinSeasonPending = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  const message = code === "SEASON_FULL" ? GUEST_SEASON_FULL_MESSAGE : serverMessage || "Guest spots are full. Sign in to claim an empire.";
  try {
    if (firebaseAuth) await signOut(firebaseAuth);
  } catch {
    // The sign-in card below still explains what to do.
  }
  setAuthStatus(message, "error");
  syncAuthOverlay();
};

const AUTO_JOIN_RETRY_MS = 15_000;
let lastAutoJoinAttemptAt = 0;

type AutoJoinState = Pick<ClientState, "authIsGuest" | "needsSeasonJoin" | "seasonPending" | "joinSeasonPending" | "profileSetupRequired">;

// True when a guest should be sent into an active season without the "Join
// season" prompt: "Play now" means playing, not clicking through a second
// screen. Recording the attempt here, and refusing another for a while, is
// what stops a join that comes back without spawning (no free spot) from
// re-firing on every render.
export const takeGuestAutoJoinTurn = (state: AutoJoinState, now: number): boolean => {
  if (!state.authIsGuest || !state.needsSeasonJoin || state.seasonPending || state.joinSeasonPending || state.profileSetupRequired) return false;
  if (now - lastAutoJoinAttemptAt < AUTO_JOIN_RETRY_MS) return false;
  lastAutoJoinAttemptAt = now;
  return true;
};

export const resetGuestAutoJoinForTests = (): void => {
  lastAutoJoinAttemptAt = 0;
};
