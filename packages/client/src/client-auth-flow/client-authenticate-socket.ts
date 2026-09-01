import { rallyCodeFromLocation } from "../client-rally-links/client-rally-links.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { AuthSession } from "./client-auth-flow.js";
import type { Auth } from "firebase/auth";

type SocketAuthenticator = {
  authenticateSocket: (forceRefresh?: boolean) => Promise<void>;
  clearAuthInFlight: () => void;
};

export const createSocketAuthenticator = (
  firebaseAuth: Auth | undefined,
  ws: RealtimeSocket,
  authSession: AuthSession,
  devAuthPlayerId?: string
): SocketAuthenticator => {
  let authInFlight = false;
  const clearAuthInFlight = (): void => { authInFlight = false; };

  const authenticateSocket = async (forceRefresh = false): Promise<void> => {
    if (ws.readyState !== ws.OPEN) return;
    if (authInFlight) return;
    authInFlight = true;
    try {
      const rallyCode = typeof window !== "undefined" ? rallyCodeFromLocation(window.location) : undefined;
      // Localhost-only agent/dev bypass: send the raw player id as the token
      // instead of a real Firebase ID token. The gateway only honors this
      // when its own DEFAULT_HUMAN_PLAYER_ID env var is set, so this branch
      // is inert against staging/prod even if devAuthPlayerId were ever set
      // there by mistake.
      if (devAuthPlayerId) {
        authSession.token = devAuthPlayerId;
        authSession.uid = devAuthPlayerId;
        ws.send(JSON.stringify({ type: "AUTH", token: devAuthPlayerId, ...(rallyCode ? { rallyCode } : {}) }));
        return;
      }
      if (!firebaseAuth?.currentUser) {
        // Firebase auth state hasn't resolved yet (common on a fresh page
        // load racing the socket open). Clear the flag so a later retry
        // (auth state change, reconnect) isn't permanently blocked.
        authInFlight = false;
        return;
      }
      authSession.token = await firebaseAuth.currentUser.getIdToken(forceRefresh);
      authSession.uid = firebaseAuth.currentUser.uid;
      ws.send(JSON.stringify({ type: "AUTH", token: authSession.token, ...(rallyCode ? { rallyCode } : {}) }));
    } catch {
      authInFlight = false;
    }
  };

  return { authenticateSocket, clearAuthInFlight };
};
