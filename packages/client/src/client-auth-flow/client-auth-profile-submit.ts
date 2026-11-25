import { updateProfile, type Auth } from "firebase/auth";
import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import { applyDeployWait, DEPLOY_WAIT_DETAIL } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";

export type ProfileChoice = { displayName: string; color: string };

type ProfileSubmitDeps = {
  state: Pick<
    ClientState,
    | "authReady"
    | "authSessionReady"
    | "connection"
    | "profileSetupRequired"
    | "authBusy"
    | "authBusyStartedAt"
    | "authBusyTitle"
    | "authBusyDetail"
    | "authOfflineSince"
  >;
  ws: Pick<RealtimeSocket, "readyState" | "OPEN" | "send">;
  firebaseAuth?: Pick<Auth, "currentUser"> | undefined;
  /** Reads the founding name + colour exactly as the player left them. */
  readChoice: () => ProfileChoice;
  requireAuthedSession: (message?: string) => boolean;
  setAuthBusy: (busy: boolean) => void;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthOverlay: () => void;
};

export type ProfileSubmitter = {
  /** "Enter the map": sends now, or holds the choice while the server is down. */
  submitFromForm: () => Promise<void>;
  /** Sends a held choice once INIT has restored the session. */
  flushPending: () => void;
};

/**
 * "Enter the map" on the founding screen. A tap while the socket is down
 * (usually a deploy restart) keeps the chosen name and colour and sends them
 * once the session is back, instead of a raw "server unavailable" error.
 * Name validation and server-side rejections keep their own error copy.
 */
export const createProfileSubmitter = (deps: ProfileSubmitDeps): ProfileSubmitter => {
  const { state, ws, firebaseAuth } = deps;
  let pending: (ProfileChoice & { uid: string }) | undefined;

  const currentUid = (): string => firebaseAuth?.currentUser?.uid ?? "";
  // SET_PROFILE before the reopened socket's INIT would be answered NO_AUTH.
  const sessionLive = (): boolean => ws.readyState === ws.OPEN && state.connection === "initialized" && state.authSessionReady;

  const send = async (choice: ProfileChoice): Promise<void> => {
    deps.setAuthBusy(true);
    deps.setAuthStatus("Raising your banner...");
    deps.syncAuthOverlay();
    try {
      ws.send(JSON.stringify({ type: "SET_PROFILE", displayName: choice.displayName, color: choice.color }));
      const user = firebaseAuth?.currentUser;
      if (user && user.displayName !== choice.displayName) await updateProfile(user, { displayName: choice.displayName });
    } catch (error) {
      deps.setAuthStatus(error instanceof Error ? error.message : "Could not save your empire profile.", "error");
    } finally {
      deps.setAuthBusy(false);
      deps.syncAuthOverlay();
    }
  };

  const submitFromForm = async (): Promise<void> => {
    if (!state.authReady && !state.authSessionReady) {
      deps.requireAuthedSession("Connection lost. Reconnect before finishing setup.");
      deps.syncAuthOverlay();
      return;
    }
    const choice = deps.readChoice();
    if (choice.displayName.length < 2) {
      deps.setAuthStatus("Display name must be at least 2 characters.", "error");
      deps.syncAuthOverlay();
      return;
    }
    if (!sessionLive()) {
      pending = { ...choice, uid: currentUid() };
      applyDeployWait(state);
      deps.setAuthStatus(DEPLOY_WAIT_DETAIL);
      deps.syncAuthOverlay();
      return;
    }
    pending = undefined;
    await send(choice);
  };

  const flushPending = (): void => {
    if (!pending || !sessionLive()) return;
    const held = pending;
    pending = undefined;
    // A different account signed in meanwhile, or setup already finished.
    if (held.uid !== currentUid() || !state.profileSetupRequired) return;
    void send(held);
  };

  return { submitFromForm, flushPending };
};
