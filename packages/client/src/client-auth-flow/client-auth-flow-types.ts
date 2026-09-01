import type { Analytics } from "firebase/analytics";
import type { Auth } from "firebase/auth";
import type { GoogleAuthProvider } from "firebase/auth";
import type { User } from "firebase/auth";
import type { initClientDom } from "../client-dom.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";

export type AuthSession = {
  token: string;
  uid: string;
  emailLinkSentTo: string;
  emailLinkPending: boolean;
};

export type ClientDom = ReturnType<typeof initClientDom>;

export type AuthFlowDeps = {
  state: ClientState;
  dom: ClientDom;
  firebaseAuth?: Auth;
  googleProvider?: GoogleAuthProvider | undefined;
  analytics?: Analytics | undefined;
  ws: RealtimeSocket;
  wsUrl: string;
  requireAuthedSession: (message?: string) => boolean;
  renderHud: () => void;
  isMobile: () => boolean;
  devAuthPlayerId?: string;
};

export type ClientAuthFlow = {
  authSession: AuthSession;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthPanelState: () => void;
  syncAuthOverlay: () => void;
  authLabelForUser: (user: User) => string;
  seedProfileSetupFields: (name?: string, color?: string) => void;
  authenticateSocket: (forceRefresh?: boolean) => Promise<void>;
  clearAuthInFlight: () => void;
  bindAuthUi: () => void;
  bindFirebaseAuth: () => void;
};
