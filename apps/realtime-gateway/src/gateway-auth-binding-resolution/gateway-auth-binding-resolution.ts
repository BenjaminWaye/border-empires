import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type ResolvedGatewayAuthBinding = GatewayResolvedIdentity & {
  bindingSource: "uid" | "email" | "new" | "unbound";
};

export const reconcileGatewayAuthBinding = async (
  identity: GatewayResolvedIdentity,
  authBindingStore: GatewayAuthBindingStore
): Promise<ResolvedGatewayAuthBinding> => {
  if (!identity.authUid) {
    return {
      ...identity,
      bindingSource: "unbound"
    };
  }

  const uidBinding = await authBindingStore.getByUid(identity.authUid);
  if (uidBinding) {
    return {
      ...identity,
      playerId: uidBinding.playerId,
      ...(uidBinding.email ? { authEmail: uidBinding.email } : identity.authEmail ? { authEmail: identity.authEmail } : {}),
      bindingSource: "uid"
    };
  }

  const emailBinding = identity.authEmail ? await authBindingStore.getByEmail(identity.authEmail) : undefined;

  // Defense in depth: never let a first-time login silently reuse a playerId that is
  // already durably bound to a different uid. That collision previously happened when
  // an upstream default-player-id fallback resolved to the same playerId for every
  // unmapped user. This only guards the unlinked fallback path: a legitimate email
  // match (same person, new device) is trusted and intentionally reuses the existing
  // playerId above.
  let candidatePlayerId = identity.playerId;
  if (!emailBinding) {
    const existingPlayerIdOwner = await authBindingStore.getByPlayerId(candidatePlayerId);
    if (existingPlayerIdOwner && existingPlayerIdOwner.uid !== identity.authUid) {
      candidatePlayerId = identity.authUid;
    }
  } else {
    candidatePlayerId = emailBinding.playerId;
  }

  const persistedBinding = await authBindingStore.bindIdentity({
    uid: identity.authUid,
    playerId: candidatePlayerId,
    ...(identity.authEmail ? { email: identity.authEmail } : {})
  });

  return {
    ...identity,
    playerId: persistedBinding.playerId,
    ...(persistedBinding.email
      ? { authEmail: persistedBinding.email }
      : identity.authEmail
        ? { authEmail: identity.authEmail }
        : {}),
    bindingSource: emailBinding ? "email" : "new"
  };
};
