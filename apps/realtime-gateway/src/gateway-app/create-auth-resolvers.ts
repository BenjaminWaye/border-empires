import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { FirebaseTokenVerifier, FirebaseTokenRejectReason } from "../auth-identity/firebase-token-verifier.js";
import type { ResolvedGatewayAuthBinding } from "../gateway-auth-binding-resolution/gateway-auth-binding-resolution.js";
import { createGatewayFirebaseVerifier, createGatewayIdentityResolver } from "../gateway-identity-resolver/gateway-identity-resolver.js";

interface AuthResolverDeps {
  options: { defaultHumanPlayerId?: string; firebaseTokenVerifier?: FirebaseTokenVerifier; firebaseProjectId?: string };
  getAuthIdentities: () => Array<{ uid: string; playerId: string; name?: string; email?: string }> | undefined;
  bindings: GatewayAuthBindingStore;
  reconcile: (identity: GatewayResolvedIdentity) => Promise<ResolvedGatewayAuthBinding>;
  onReject: () => void;
  onRejectReason: (reason: FirebaseTokenRejectReason) => void;
}

/** Recheck after asynchronous world bootstrap, before attaching a new socket. */
export const allowAccountSession = async (uid: string | undefined, bindings: GatewayAuthBindingStore, socket: { close: (code: number, reason: string) => void }): Promise<boolean> => {
  if (!uid || !(await bindings.accountDeletion?.isBlocked(uid))) return true;
  socket.close(4003, "account_deleted");
  return false;
};
export const createAuthResolvers = (deps: AuthResolverDeps): {
  resolveIdentityForToken: (token: string) => Promise<GatewayResolvedIdentity | undefined>;
  resolveHttpBearerIdentity: (header: string | undefined) => Promise<ResolvedGatewayAuthBinding | undefined>;
} => {
  const verify = createGatewayFirebaseVerifier({
    ...(deps.options.firebaseTokenVerifier ? { injected: deps.options.firebaseTokenVerifier } : {}),
    ...(deps.options.firebaseProjectId ? { projectId: deps.options.firebaseProjectId } : {}),
    onReject: deps.onReject, onRejectReason: deps.onRejectReason
  });
  const resolveIdentityForToken = createGatewayIdentityResolver({
    ...(deps.options.defaultHumanPlayerId ? { defaultHumanPlayerId: deps.options.defaultHumanPlayerId } : {}),
    getAuthIdentities: deps.getAuthIdentities,
    verifyFirebaseToken: async (token) => {
      const identity = await verify(token);
      if (identity && await deps.bindings.accountDeletion?.isBlocked(identity.uid)) {
        deps.onReject();
        return undefined;
      }
      return identity;
    }
  });
  return {
    resolveIdentityForToken,
    resolveHttpBearerIdentity: async (header) => {
      const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!token) return undefined;
      const identity = await resolveIdentityForToken(token);
      return identity ? deps.reconcile(identity) : undefined;
    }
  };
};
