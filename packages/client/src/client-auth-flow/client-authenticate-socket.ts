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
  authSession: AuthSession
): SocketAuthenticator => {
  let authInFlight = false;
  const clearAuthInFlight = (): void => { authInFlight = false; };

  const authenticateSocket = async (forceRefresh = false): Promise<void> => {
    if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN) return;
    if (authInFlight) return;
    authInFlight = true;
    try {
      authSession.token = await firebaseAuth.currentUser.getIdToken(forceRefresh);
      authSession.uid = firebaseAuth.currentUser.uid;
      const rallyCode = typeof window !== "undefined" ? rallyCodeFromLocation(window.location) : undefined;
      ws.send(JSON.stringify({ type: "AUTH", token: authSession.token, ...(rallyCode ? { rallyCode } : {}) }));
    } catch {
      authInFlight = false;
    }
  };

  return { authenticateSocket, clearAuthInFlight };
};
