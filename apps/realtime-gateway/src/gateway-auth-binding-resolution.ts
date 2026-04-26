import type { GatewayResolvedIdentity } from "./auth-identity.js";
import type { GatewayAuthBindingStore } from "./auth-binding-store.js";

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
  const persistedBinding = await authBindingStore.bindIdentity({
    uid: identity.authUid,
    playerId: emailBinding?.playerId ?? identity.playerId,
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
