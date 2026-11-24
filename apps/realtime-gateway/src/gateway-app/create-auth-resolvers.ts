import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { FirebaseTokenVerifier, FirebaseTokenRejectReason } from "../auth-identity/firebase-token-verifier.js";
import type { ResolvedGatewayAuthBinding } from "../gateway-auth-binding-resolution/gateway-auth-binding-resolution.js";
import { createHostedSectorTicketVerifier, type HostedSectorConfig, type HostedSectorTicketRejectReason } from "../hosted-sector/hosted-sector-ticket.js";
import { createGatewayFirebaseVerifier, createGatewayIdentityResolver } from "../gateway-identity-resolver/gateway-identity-resolver.js";

interface AuthResolverDeps {
  options: { defaultHumanPlayerId?: string; firebaseTokenVerifier?: FirebaseTokenVerifier; firebaseProjectId?: string; hostedSector?: HostedSectorConfig; now?: () => number };
  getAuthIdentities: () => Array<{ uid: string; playerId: string; name?: string; email?: string }> | undefined;
  bindings: GatewayAuthBindingStore;
  reconcile: (identity: GatewayResolvedIdentity) => Promise<ResolvedGatewayAuthBinding>;
  onReject: () => void;
  onRejectReason: (reason: FirebaseTokenRejectReason | HostedSectorTicketRejectReason) => void;
}

/** Recheck after asynchronous world bootstrap, before attaching a new socket. */
export const allowAccountSession = async (uid: string | undefined, bindings: GatewayAuthBindingStore, socket: { close: (code: number, reason: string) => void }): Promise<boolean> => {
  if (!uid || !(await bindings.accountDeletion?.isBlocked(uid))) return true;
  socket.close(4003, "account_deleted");
  return false;
};
export type LoginRejection = { type: "ERROR"; code: "AUTH_FAIL" | "SECTOR_TICKET_REJECTED"; message: string };

const TOKEN_REJECTED: LoginRejection = { type: "ERROR", code: "AUTH_FAIL", message: "Authentication token is not recognized by the rewrite gateway." };
// Its own code, so a client does not answer it by refreshing the sign-in,
// which cannot help: the account is fine, it lacks a ticket for this sector.
const TICKET_REJECTED: LoginRejection = { type: "ERROR", code: "SECTOR_TICKET_REJECTED", message: "This sector is private. Open it from My sectors to enter." };

export const createAuthResolvers = (deps: AuthResolverDeps): {
  /** WebSocket login. On a hosted sector the account must also hold a valid membership ticket. */
  resolveLogin: (token: string, sectorTicket?: string) => Promise<{ identity: GatewayResolvedIdentity } | { error: LoginRejection }>;
  resolveHttpBearerIdentity: (header: string | undefined) => Promise<ResolvedGatewayAuthBinding | undefined>;
} => {
  const verify = createGatewayFirebaseVerifier({
    ...(deps.options.firebaseTokenVerifier ? { injected: deps.options.firebaseTokenVerifier } : {}),
    ...(deps.options.firebaseProjectId ? { projectId: deps.options.firebaseProjectId } : {}),
    onReject: deps.onReject, onRejectReason: deps.onRejectReason
  });
  const resolveIdentity = createGatewayIdentityResolver({
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
  const verifyTicket = deps.options.hostedSector
    ? createHostedSectorTicketVerifier(deps.options.hostedSector, deps.options.now ? { now: deps.options.now } : {})
    : undefined;
  const resolveLogin = async (token: string, sectorTicket?: string): Promise<{ identity: GatewayResolvedIdentity } | { error: LoginRejection }> => {
    const identity = await resolveIdentity(token);
    if (!identity) return { error: TOKEN_REJECTED };
    if (!verifyTicket) return { identity };
    const admitted = await verifyTicket(sectorTicket, identity.authUid);
    if (admitted.ok) return { identity };
    deps.onRejectReason(admitted.reason);
    return { error: TICKET_REJECTED };
  };
  return {
    resolveLogin,
    resolveHttpBearerIdentity: async (header) => {
      const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!token) return undefined;
      const identity = await resolveIdentity(token);
      if (!identity) return undefined;
      // HTTP routes carry no ticket. On a hosted sector they are open only to
      // accounts that have already entered through the WebSocket login, which
      // is what records the account here. Everyone else is a stranger.
      if (verifyTicket && !(identity.authUid && (await deps.bindings.getByUid(identity.authUid)))) return undefined;
      return deps.reconcile(identity);
    }
  };
};
