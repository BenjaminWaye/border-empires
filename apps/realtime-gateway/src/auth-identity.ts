const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const decodeFirebaseTokenFallback = (
  token: string
): { uid: string; email?: string; name?: string } | undefined => {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const uid = typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : "";
  if (!uid) return undefined;
  const decoded: { uid: string; email?: string; name?: string } = { uid };
  if (typeof payload.email === "string") decoded.email = payload.email;
  if (typeof payload.name === "string") decoded.name = payload.name;
  return decoded;
};

const normalizeDisplayName = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const fallbackDisplayNameForToken = (token: string): string => {
  const trimmed = token.trim();
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 12)}...${trimmed.slice(-8)}`;
};

export type GatewayResolvedIdentity = {
  playerId: string;
  playerName: string;
  authUid?: string;
  authEmail?: string;
};

export const resolveGatewayAuthIdentity = (
  token: string,
  options: {
    defaultHumanPlayerId?: string;
    authIdentities?: Array<{ uid: string; playerId: string; name?: string; email?: string }>;
  } = {}
): GatewayResolvedIdentity => {
  const directMappedIdentity = options.authIdentities?.find(
    (identity) => identity.uid === token || identity.email === token || identity.playerId === token
  );
  if (directMappedIdentity) {
    return {
      playerId: directMappedIdentity.playerId,
      playerName: normalizeDisplayName(directMappedIdentity.name) ?? fallbackDisplayNameForToken(token),
      authUid: directMappedIdentity.uid,
      ...(directMappedIdentity.email ? { authEmail: directMappedIdentity.email } : {})
    };
  }

  const decoded = decodeFirebaseTokenFallback(token);
  if (!decoded) {
    return {
      playerId: token,
      playerName: fallbackDisplayNameForToken(token)
    };
  }

  const playerName =
    normalizeDisplayName(decoded.name) ??
    normalizeDisplayName(decoded.email?.split("@")[0]) ??
    "Player";
  const mappedIdentity = options.authIdentities?.find(
    (identity) => identity.uid === decoded.uid || (decoded.email && identity.email === decoded.email)
  );

  return {
    playerId: mappedIdentity?.playerId ?? options.defaultHumanPlayerId ?? decoded.uid,
    playerName: normalizeDisplayName(mappedIdentity?.name) ?? playerName,
    authUid: decoded.uid,
    ...(mappedIdentity?.email ? { authEmail: mappedIdentity.email } : decoded.email ? { authEmail: decoded.email } : {})
  };
};
