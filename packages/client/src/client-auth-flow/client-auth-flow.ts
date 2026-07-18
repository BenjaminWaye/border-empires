import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  updateProfile,
  type Auth,
  type GoogleAuthProvider,
  type User
} from "firebase/auth";
import type { initClientDom } from "../client-dom.js";
import {
  authLabelForUser as authLabelForUserFromModule,
  seedProfileSetupFields as seedProfileSetupFieldsFromModule,
  setAuthStatus as setAuthStatusFromModule,
  syncAuthOverlay as syncAuthOverlayFromModule,
  syncAuthPanelState as syncAuthPanelStateFromModule
} from "../client-auth-ui/client-auth-ui.js";
import { MOBILE_LOGIN_ZOOM } from "../client-constants.js";
import { setDebugAuthEmail } from "../client-debug/client-debug.js";
import {
  detectInAppBrowserName,
  inAppBrowserGoogleSignInMessage,
  isMissingInitialStateError,
  MISSING_INITIAL_STATE_MESSAGE
} from "../client-inapp-browser/client-inapp-browser.js";
import { clearStoredMapReveal, getMapRevealEnabled } from "../client-map-reveal/client-map-reveal.js";
import { rallyCodeFromLocation } from "../client-rally-links/client-rally-links.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";

export type AuthSession = {
  token: string;
  uid: string;
  emailLinkSentTo: string;
  emailLinkPending: boolean;
};

type ClientDom = ReturnType<typeof initClientDom>;

type AuthFlowDeps = {
  state: ClientState;
  dom: ClientDom;
  firebaseAuth?: Auth;
  googleProvider?: GoogleAuthProvider | undefined;
  ws: RealtimeSocket;
  wsUrl: string;
  requireAuthedSession: (message?: string) => boolean;
  renderHud: () => void;
  isMobile: () => boolean;
};

type ClientAuthFlow = {
  authSession: AuthSession;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthPanelState: () => void;
  syncAuthOverlay: () => void;
  authLabelForUser: (user: User) => string;
  seedProfileSetupFields: (name?: string, color?: string) => void;
  authenticateSocket: (forceRefresh?: boolean) => Promise<void>;
  bindAuthUi: () => void;
  bindFirebaseAuth: () => void;
};

export const createClientAuthFlow = (deps: AuthFlowDeps): ClientAuthFlow => {
  const {
    state,
    dom,
    firebaseAuth,
    googleProvider,
    ws,
    wsUrl,
    requireAuthedSession,
    renderHud,
    isMobile
  } = deps;

  const authSession: AuthSession = {
    token: "",
    uid: "",
    emailLinkSentTo: "",
    emailLinkPending: false
  };
  const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";

  // Safari private browsing / ITP (and email-link taps opened from Mail in a
  // locked-down WebKit context) can throw on any localStorage access rather
  // than just returning null. An unguarded throw here during bootstrap used
  // to abort the entire client init with no diagnostics, and because the
  // sign-in link's query string is never cleared on that path, every reload
  // of the same link reproduced the identical crash (Safari's "a problem
  // repeatedly occurred" page). These wrappers make storage access degrade
  // gracefully instead of crashing; normal browsers with working storage are
  // unaffected.
  const safeLocalStorageGet = (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeLocalStorageSet = (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage unavailable — same-device autofill just won't work.
    }
  };

  const safeLocalStorageRemove = (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable — nothing to clean up.
    }
  };

  const clearEmailLinkUrl = (): void => {
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = "";
      cleanUrl.hash = "";
      window.history.replaceState({}, document.title, cleanUrl.toString());
    } catch {
      // If history mutation fails for any reason, leave the URL as-is
      // rather than throwing during auth handling.
    }
  };

  const setAuthStatus = (message: string, tone: "normal" | "error" = "normal"): void =>
    setAuthStatusFromModule(state, dom.authStatusEl, message, tone);

  const syncAuthPanelState = (): void =>
    syncAuthPanelStateFromModule(state, {
      authEmailLinkSentTo: authSession.emailLinkSentTo,
      authPanelEl: dom.authPanelEl,
      authEmailSentAddressEl: dom.authEmailSentAddressEl,
      authProfileColorEl: dom.authProfileColorEl,
      authColorPresetButtons: dom.authColorPresetButtons
    });

  const syncAuthOverlay = (): void =>
    syncAuthOverlayFromModule(state, {
      authOverlayEl: dom.authOverlayEl,
      authBusyModalEl: dom.authBusyModalEl,
      authLoginBtn: dom.authLoginBtn,
      authRegisterBtn: dom.authRegisterBtn,
      authEmailLinkBtn: dom.authEmailLinkBtn,
      authGoogleBtn: dom.authGoogleBtn,
      authEmailEl: dom.authEmailEl,
      authPasswordEl: dom.authPasswordEl,
      authDisplayNameEl: dom.authDisplayNameEl,
      authEmailResetBtn: dom.authEmailResetBtn,
      authProfileNameEl: dom.authProfileNameEl,
      authProfileColorEl: dom.authProfileColorEl,
      authProfileSaveBtn: dom.authProfileSaveBtn,
      authBusyTitleEl: dom.authBusyTitleEl,
      authBusyCopyEl: dom.authBusyCopyEl,
      authStatusEl: dom.authStatusEl,
      authDebugRouteEl: dom.authDebugRouteEl,
      wsUrl,
      syncAuthPanelState,
      setAuthStatus
    });

  const authLabelForUser = (user: User): string => authLabelForUserFromModule(user);

  const seedProfileSetupFields = (name?: string, color?: string): void =>
    seedProfileSetupFieldsFromModule(
      {
        authProfileNameEl: dom.authProfileNameEl,
        authProfileColorEl: dom.authProfileColorEl,
        syncAuthPanelState
      },
      name,
      color
    );

  const authenticateSocket = async (forceRefresh = false): Promise<void> => {
    if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN) return;
    authSession.token = await firebaseAuth.currentUser.getIdToken(forceRefresh);
    authSession.uid = firebaseAuth.currentUser.uid;
    const rallyCode = typeof window !== "undefined" ? rallyCodeFromLocation(window.location) : undefined;
    ws.send(JSON.stringify({ type: "AUTH", token: authSession.token, ...(rallyCode ? { rallyCode } : {}) }));
  };

  const setAuthBusy = (busy: boolean): void => {
    state.authBusy = busy;
    state.authBusyStartedAt = busy ? (state.authBusyStartedAt || Date.now()) : 0;
  };

  const completeEmailLinkSignIn = async (emailRaw: string): Promise<void> => {
    if (!firebaseAuth) return;
    const email = emailRaw.trim();
    if (!email) {
      setAuthStatus("Enter the email address that received the sign-in link.", "error");
      syncAuthOverlay();
      return;
    }
    setAuthBusy(true);
    setAuthStatus("Completing email link sign-in...");
    syncAuthOverlay();
    try {
      await signInWithEmailLink(firebaseAuth, email, window.location.href);
      authSession.emailLinkPending = false;
      authSession.emailLinkSentTo = "";
      safeLocalStorageRemove(EMAIL_LINK_STORAGE_KEY);
      clearEmailLinkUrl();
    } catch (error) {
      // The sign-in code is single-use and short-lived: a failure here means
      // retrying with the same URL/stored email will always fail the same
      // way. Clear both so a reload (or Safari's own retry) starts fresh
      // instead of repeating the identical failure indefinitely.
      authSession.emailLinkPending = false;
      safeLocalStorageRemove(EMAIL_LINK_STORAGE_KEY);
      clearEmailLinkUrl();
      setAuthStatus(error instanceof Error ? error.message : "Email link sign-in failed.", "error");
    } finally {
      setAuthBusy(false);
      syncAuthOverlay();
    }
  };

  const authEmailAndPassword = async (mode: "login" | "register"): Promise<void> => {
    if (!firebaseAuth) return;
    const email = dom.authEmailEl.value.trim();
    const password = dom.authPasswordEl.value;
    const displayName = dom.authDisplayNameEl.value.trim();
    if (!email || !password) {
      setAuthStatus("Email and password are required.", "error");
      syncAuthOverlay();
      return;
    }
    if (mode === "register" && !displayName) {
      setAuthStatus("Display name is required for new accounts.", "error");
      syncAuthOverlay();
      return;
    }
    setAuthBusy(true);
    setAuthStatus(mode === "login" ? "Signing in..." : "Creating account...");
    syncAuthOverlay();
    let authSucceeded = false;
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        if (displayName) await updateProfile(cred.user, { displayName });
      }
      authSucceeded = true;
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Authentication failed.", "error");
    } finally {
      if (!authSucceeded) setAuthBusy(false);
      syncAuthOverlay();
    }
  };

  const bindAuthUi = (): void => {
    dom.authLoginBtn.onclick = () => {
      void authEmailAndPassword("login");
    };

    dom.authRegisterBtn.onclick = () => {
      void authEmailAndPassword("register");
    };

    dom.authGoogleBtn.onclick = async () => {
      if (!firebaseAuth || !googleProvider) return;
      const inAppBrowserName =
        typeof navigator !== "undefined" ? detectInAppBrowserName(navigator.userAgent) : undefined;
      if (inAppBrowserName) {
        setAuthStatus(inAppBrowserGoogleSignInMessage(inAppBrowserName), "error");
        syncAuthOverlay();
        return;
      }
      authSession.emailLinkSentTo = "";
      setAuthBusy(true);
      setAuthStatus("Opening Google sign-in...");
      syncAuthOverlay();
      let authSucceeded = false;
      try {
        await signInWithPopup(firebaseAuth, googleProvider);
        authSucceeded = true;
        setAuthStatus("Google sign-in complete. Authorizing empire...");
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "Google sign-in failed.";
        setAuthStatus(isMissingInitialStateError(rawMessage) ? MISSING_INITIAL_STATE_MESSAGE : rawMessage, "error");
      } finally {
        if (!authSucceeded) setAuthBusy(false);
        syncAuthOverlay();
      }
    };

    dom.authEmailLinkBtn.onclick = async () => {
      if (!firebaseAuth) return;
      const email = dom.authEmailEl.value.trim();
      if (authSession.emailLinkPending && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
        await completeEmailLinkSignIn(email);
        return;
      }
      if (!email) {
        setAuthStatus("Enter your email first.", "error");
        syncAuthOverlay();
        return;
      }
      setAuthBusy(true);
      setAuthStatus("Sending sign-in link...");
      syncAuthOverlay();
      try {
        await sendSignInLinkToEmail(firebaseAuth, email, {
          url: window.location.href,
          handleCodeInApp: true
        });
        safeLocalStorageSet(EMAIL_LINK_STORAGE_KEY, email);
        authSession.emailLinkSentTo = email;
        setAuthStatus("");
      } catch (error) {
        authSession.emailLinkSentTo = "";
        setAuthStatus(error instanceof Error ? error.message : "Could not send email link.", "error");
      } finally {
        setAuthBusy(false);
        syncAuthOverlay();
      }
    };

    dom.authEmailResetBtn.onclick = () => {
      authSession.emailLinkSentTo = "";
      setAuthStatus("");
      dom.authEmailEl.focus();
      syncAuthOverlay();
    };

    dom.authProfileSaveBtn.onclick = async () => {
      if (!requireAuthedSession("Connection lost. Reconnect before finishing setup.")) {
        syncAuthOverlay();
        return;
      }
      const displayName = dom.authProfileNameEl.value.trim();
      if (displayName.length < 2) {
        setAuthStatus("Display name must be at least 2 characters.", "error");
        syncAuthOverlay();
        return;
      }
      setAuthBusy(true);
      setAuthStatus("Raising your banner...");
      syncAuthOverlay();
      try {
        ws.send(JSON.stringify({ type: "SET_PROFILE", displayName, color: dom.authProfileColorEl.value }));
        if (firebaseAuth?.currentUser && firebaseAuth.currentUser.displayName !== displayName) {
          await updateProfile(firebaseAuth.currentUser, { displayName });
        }
      } catch (error) {
        setAuthStatus(error instanceof Error ? error.message : "Could not save your empire profile.", "error");
      } finally {
        setAuthBusy(false);
        syncAuthOverlay();
      }
    };
  };

  const bindFirebaseAuth = (): void => {
    state.authConfigured = Boolean(firebaseAuth);
    syncAuthOverlay();

    if (firebaseAuth) {
      void setPersistence(firebaseAuth, browserLocalPersistence);
      onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          setDebugAuthEmail("");
          state.mapRevealEligible = false;
          state.mapRevealEnabled = false;
          state.authReady = false;
          state.authSessionReady = false;
          state.authUserLabel = "";
          state.authEmail = "";
          state.profileSetupRequired = false;
          authSession.token = "";
          authSession.uid = "";
          setAuthBusy(false);
          state.authRetrying = false;
          state.authRetryAttempt = 0;
          state.authRetryNextAt = 0;
          dom.authProfileNameEl.value = "";
          dom.authProfileColorEl.value = "#38b000";
          syncAuthOverlay();
          return;
        }
        authSession.emailLinkSentTo = "";
        const authEmail = user.email ?? undefined;
        setDebugAuthEmail(authEmail);
        // Force fog admin to re-activate reveal on every sign-in. A stale "1" in
        // localStorage from a prior session caused syncDesiredFogDisabled to
        // auto-resend REQUEST_REVEAL_MAP on connect, which triggers a full-world
        // refresh on every TILE_DELTA_BATCH and starves login bootstrap.
        clearStoredMapReveal(authEmail ?? null);
        state.mapRevealEligible = false;
        state.authEmail = authEmail ?? "";
        state.mapRevealEnabled = getMapRevealEnabled({
          enabledForAccount: state.mapRevealEligible,
          authEmail: authEmail ?? null
        });
        state.authReady = true;
        state.authSessionReady = false;
        if (isMobile()) {
          state.zoom = MOBILE_LOGIN_ZOOM;
        }
        setAuthBusy(true);
        state.authRetrying = false;
        state.authUserLabel = authLabelForUser(user);
        state.authBusyTitle = "Securing session";
        state.authBusyDetail = "Loading your Google session and waiting for the realtime server connection.";
        seedProfileSetupFields(user.displayName ?? user.email?.split("@")[0] ?? "", dom.authProfileColorEl.value);
        setAuthStatus("Authorizing empire...");
        syncAuthOverlay();
        try {
          authSession.token = await user.getIdToken();
          authSession.uid = user.uid;
          state.authBusyTitle = "Connecting your empire...";
          state.authBusyDetail = `Realtime connection open. Sending your Google session for ${state.authUserLabel}...`;
          setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel}...`);
          if (ws.readyState === ws.OPEN) {
            const rallyCode = typeof window !== "undefined" ? rallyCodeFromLocation(window.location) : undefined;
            ws.send(JSON.stringify({ type: "AUTH", token: authSession.token, ...(rallyCode ? { rallyCode } : {}) }));
          } else {
            setAuthBusy(true);
            state.authBusyTitle = "Securing session";
            state.authBusyDetail = `Google account connected, but the realtime game connection to ${wsUrl} has not opened yet. The server may still be starting or overloaded.`;
            setAuthStatus(`Google account connected. Waiting for the game server at ${wsUrl}...`);
          }
        } catch (error) {
          state.authSessionReady = false;
          setAuthBusy(false);
          state.authBusyTitle = "";
          state.authBusyDetail = "";
          setAuthStatus(error instanceof Error ? error.message : "Could not authorize this session.", "error");
        } finally {
          syncAuthOverlay();
          renderHud();
        }
      });
    }

    try {
      if (firebaseAuth && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
        const storedEmail = safeLocalStorageGet(EMAIL_LINK_STORAGE_KEY) ?? dom.authEmailEl.value.trim();
        if (storedEmail) {
          void completeEmailLinkSignIn(storedEmail);
        } else {
          authSession.emailLinkPending = true;
          authSession.emailLinkSentTo = "";
          setAuthStatus("Enter the email address that received the sign-in link, then press Continue with Email.");
          syncAuthOverlay();
        }
      }
    } catch (error) {
      // Detecting/handling the email-sign-in link touched a Firebase SDK or
      // browser storage call that threw (e.g. Safari private browsing).
      // Clear the stale link params so a reload doesn't repeat the crash,
      // and fall back to the normal login form instead of leaving the app
      // stuck mid-bootstrap.
      clearEmailLinkUrl();
      setAuthStatus(error instanceof Error ? error.message : "Could not process the sign-in link.", "error");
      syncAuthOverlay();
    }
  };

  return {
    authSession,
    setAuthStatus,
    syncAuthPanelState,
    syncAuthOverlay,
    authLabelForUser,
    seedProfileSetupFields,
    authenticateSocket,
    bindAuthUi,
    bindFirebaseAuth
  };
};
