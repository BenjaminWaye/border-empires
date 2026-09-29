import { anonymizedEmpireNameForId, isOpaquePlayerId } from "@border-empires/shared";

import type { FirebaseTokenVerifier } from "./firebase-token-verifier.js";

// A Firebase ID token is a compact JWT: exactly three dot-separated segments.
// Anything shaped like one is never trusted until it verifies (signature,
// issuer, audience, expiry); it is not decoded or used as a direct player id.
// isGuest (below) is likewise computed inside the verifier from the verified
// payload, not re-decoded here -- see firebase-token-verifier.ts.
const looksLikeJwt = (token: string): boolean => token.split(".").length === 3;

const normalizeDisplayName = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const fallbackDisplayNameForToken = (token: string): string => {
  const trimmed = token.trim();
  if (isOpaquePlayerId(trimmed)) return anonymizedEmpireNameForId(trimmed);
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 12)}...${trimmed.slice(-8)}`;
};

// Cosmetic default display name for a player who has never set a real
// profile/auth name (their name still literally equals their raw player id).
// Must stay in sync with the equivalent fallbacks in
// apps/realtime-gateway/src/init-payload/init-payload.ts (displayNameForSeedPlayer)
// and apps/simulation/src/world-status-snapshot/world-status-snapshot.ts
// (displayNameForPlayer) so a name shown to other players (e.g. on the
// leaderboard or in the alliance search dropdown) is always resolvable by
// social-state's resolveByName for alliance/truce requests.
export const initialSocialNameForSeedPlayer = (playerId: string, seedName: string | undefined): string => {
  if (playerId === "barbarian-1") return "Barbarians";
  if (playerId.startsWith("ai-")) return `AI ${playerId.slice(3)}`;
  if (playerId === "player-1" && (seedName === undefined || seedName === playerId)) return "Nauticus";
  return seedName ?? playerId;
};

// Applies the same "uncustomized player" cosmetic default at registration
// time (login), not just at initial world seeding, so it also covers the
// direct-player-id-token auth path where the resolved auth name is just the
// raw player id (i.e. no real display name has ever been set).
export const socialRegistrationNameFor = (playerId: string, resolvedName: string): string =>
  resolvedName === playerId ? initialSocialNameForSeedPlayer(playerId, undefined) : resolvedName;

export type GatewayResolvedIdentity = {
  playerId: string;
  playerName: string;
  authUid?: string;
  authEmail?: string;
  isGuest?: boolean;
};

export const resolveGatewayAuthIdentity = async (
  token: string,
  options: {
    allowDirectPlayerIdToken?: boolean;
    defaultHumanPlayerId?: string;
    authIdentities?: Array<{ uid: string; playerId: string; name?: string; email?: string }>;
    verifyFirebaseToken?: FirebaseTokenVerifier;
  } = {}
): Promise<GatewayResolvedIdentity | undefined> => {
  // Dev/test shortcut: a token that is literally a known uid/email/player id.
  // Only honored where direct player-id tokens are (i.e. a configured default
  // human player, which managed runtimes refuse) -- uids are visible to every
  // client, so outside dev this would let anyone log in as anyone.
  if (options.allowDirectPlayerIdToken === true) {
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
  }

  if (!looksLikeJwt(token)) {
    if (options.allowDirectPlayerIdToken !== true) return undefined;
    return {
      playerId: token,
      playerName: fallbackDisplayNameForToken(token)
    };
  }

  const decoded = options.verifyFirebaseToken ? await options.verifyFirebaseToken(token) : undefined;
  if (!decoded) return undefined;

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
    ...(mappedIdentity?.email ? { authEmail: mappedIdentity.email } : decoded.email ? { authEmail: decoded.email } : {}),
    ...(decoded.isGuest ? { isGuest: true } : {})
  };
};
