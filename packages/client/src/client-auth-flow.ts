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
import type { initClientDom } from "./client-dom.js";
import {
  authLabelForUser as authLabelForUserFromModule,
  seedProfileSetupFields as seedProfileSetupFieldsFromModule,
  setAuthStatus as setAuthStatusFromModule,
  syncAuthOverlay as syncAuthOverlayFromModule,
  syncAuthPanelState as syncAuthPanelStateFromModule
} from "./client-auth-ui.js";
import { setDebugAuthEmail } from "./client-debug.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import type { ClientState } from "./client-state.js";

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
    renderHud
  } = deps;

  const authSession: AuthSession = {
    token: "",
    uid: "",
    emailLinkSentTo: "",
    emailLinkPending: false
  };
  const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";

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
    ws.send(JSON.stringify({ type: "AUTH", token: authSession.token }));
  };

  const completeEmailLinkSignIn = async (emailRaw: string): Promise<void> => {
    if (!firebaseAuth) return;
    const email = emailRaw.trim();
    if (!email) {
      setAuthStatus("Enter the email address that received the sign-in link.", "error");
      syncAuthOverlay();
      return;
    }
    state.authBusy = true;
    setAuthStatus("Completing email link sign-in...");
    syncAuthOverlay();
    try {
      await signInWithEmailLink(firebaseAuth, email, window.location.href);
      authSession.emailLinkPending = false;
      authSession.emailLinkSentTo = "";
      window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = "";
      cleanUrl.hash = "";
      window.history.replaceState({}, document.title, cleanUrl.toString());
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Email link sign-in failed.", "error");
    } finally {
      state.authBusy = false;
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
    state.authBusy = true;
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
      if (!authSucceeded) state.authBusy = false;
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
      authSession.emailLinkSentTo = "";
      state.authBusy = true;
      setAuthStatus("Opening Google sign-in...");
      syncAuthOverlay();
      let authSucceeded = false;
      try {
        await signInWithPopup(firebaseAuth, googleProvider);
        authSucceeded = true;
        setAuthStatus("Google sign-in complete. Authorizing empire...");
      } catch (error) {
        setAuthStatus(error instanceof Error ? error.message : "Google sign-in failed.", "error");
      } finally {
        if (!authSucceeded) state.authBusy = false;
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
      state.authBusy = true;
      setAuthStatus("Sending sign-in link...");
      syncAuthOverlay();
      try {
        await sendSignInLinkToEmail(firebaseAuth, email, {
          url: window.location.href,
          handleCodeInApp: true
        });
        window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
        authSession.emailLinkSentTo = email;
        setAuthStatus("");
      } catch (error) {
        authSession.emailLinkSentTo = "";
        setAuthStatus(error instanceof Error ? error.message : "Could not send email link.", "error");
      } finally {
        state.authBusy = false;
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
      state.authBusy = true;
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
        state.authBusy = false;
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
          state.authReady = false;
          state.authSessionReady = false;
          state.authUserLabel = "";
          state.profileSetupRequired = false;
          authSession.token = "";
          authSession.uid = "";
          state.authBusy = false;
          state.authRetrying = false;
          dom.authProfileNameEl.value = "";
          dom.authProfileColorEl.value = "#38b000";
          syncAuthOverlay();
          return;
        }
        authSession.emailLinkSentTo = "";
        setDebugAuthEmail(user.email ?? undefined);
        state.authReady = true;
        state.authSessionReady = false;
        state.authBusy = true;
        state.authRetrying = false;
        state.authUserLabel = authLabelForUser(user);
        state.authBusyTitle = "Securing session";
        state.authBusyDetail = "Refreshing your Google session and waiting for the realtime server connection.";
        seedProfileSetupFields(user.displayName ?? user.email?.split("@")[0] ?? "", dom.authProfileColorEl.value);
        setAuthStatus("Authorizing empire...");
        syncAuthOverlay();
        try {
          authSession.token = await user.getIdToken(true);
          authSession.uid = user.uid;
          state.authBusyTitle = "Connecting your empire...";
          state.authBusyDetail = `Realtime connection open. Sending your Google session for ${state.authUserLabel}...`;
          setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel}...`);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "AUTH", token: authSession.token }));
          } else {
            state.authBusy = true;
            state.authBusyTitle = "Securing session";
            state.authBusyDetail = `Google account connected, but the realtime game connection to ${wsUrl} has not opened yet. The server may still be starting or overloaded.`;
            setAuthStatus(`Google account connected. Waiting for the game server at ${wsUrl}...`);
          }
        } catch (error) {
          state.authSessionReady = false;
          state.authBusy = false;
          state.authBusyTitle = "";
          state.authBusyDetail = "";
          setAuthStatus(error instanceof Error ? error.message : "Could not authorize this session.", "error");
        } finally {
          syncAuthOverlay();
          renderHud();
        }
      });
    }

    if (firebaseAuth && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
      const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) ?? dom.authEmailEl.value.trim();
      if (storedEmail) {
        void completeEmailLinkSignIn(storedEmail);
      } else {
        authSession.emailLinkPending = true;
        authSession.emailLinkSentTo = "";
        setAuthStatus("Enter the email address that received the sign-in link, then press Continue with Email.");
        syncAuthOverlay();
      }
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
