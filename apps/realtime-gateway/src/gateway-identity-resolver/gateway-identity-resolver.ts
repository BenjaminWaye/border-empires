import { resolveGatewayAuthIdentity, type GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { createFirebaseTokenVerifier, type FirebaseTokenRejectReason, type FirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";

type AuthIdentityMapping = { uid: string; playerId: string; name?: string; email?: string };

export type GatewayIdentityResolverDeps = {
  defaultHumanPlayerId?: string;
  getAuthIdentities: () => AuthIdentityMapping[] | undefined;
  verifyFirebaseToken: FirebaseTokenVerifier;
};

// The single identity step shared by the WebSocket AUTH handler and the HTTP
// bearer-token routes, so both enforce the same verification.
export const createGatewayIdentityResolver =
  (deps: GatewayIdentityResolverDeps) =>
  (token: string): Promise<GatewayResolvedIdentity | undefined> => {
    const authIdentities = deps.getAuthIdentities();
    return resolveGatewayAuthIdentity(token, {
      allowDirectPlayerIdToken: Boolean(deps.defaultHumanPlayerId),
      ...(deps.defaultHumanPlayerId ? { defaultHumanPlayerId: deps.defaultHumanPlayerId } : {}),
      ...(authIdentities ? { authIdentities } : {}),
      verifyFirebaseToken: deps.verifyFirebaseToken
    });
  };

// Firebase project the gateway accepts ID tokens for. Staging and production
// both use the game's single Firebase project unless overridden. Every
// rejection is counted here, around whichever verifier is in use, so the
// counter can't be bypassed by injecting one; `onRejectReason` (built-in
// verifier only) is for diagnostics.
export const createGatewayFirebaseVerifier = (deps: {
  injected?: FirebaseTokenVerifier;
  projectId?: string;
  onReject: () => void;
  onRejectReason?: (reason: FirebaseTokenRejectReason) => void;
}): FirebaseTokenVerifier => {
  const inner =
    deps.injected ??
    createFirebaseTokenVerifier({
      projectId: deps.projectId ?? process.env.GATEWAY_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
      ...(deps.onRejectReason ? { onReject: deps.onRejectReason } : {})
    });
  return async (token) => {
    const verified = await inner(token);
    if (!verified) deps.onReject();
    return verified;
  };
};
