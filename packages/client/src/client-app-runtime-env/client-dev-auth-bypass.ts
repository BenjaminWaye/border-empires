// Lets a localhost-only client (an agent driving the browser for gameplay/
// visual testing, or a developer) authenticate directly as a given player id
// instead of going through real Firebase sign-in. The gateway already
// accepts a raw player-id string as the AUTH token when its
// DEFAULT_HUMAN_PLAYER_ID env var is set (see
// apps/realtime-gateway/src/auth-identity/auth-identity.ts,
// allowDirectPlayerIdToken) — this is the client-side counterpart, gated to
// localhost hostnames so it can never activate against staging/prod.
export const isLocalDevHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0";
};

export const resolveDevAuthPlayerId = (hostname: string, search: string): string | undefined => {
  if (!isLocalDevHostname(hostname)) return undefined;
  const playerId = new URLSearchParams(search).get("devPlayerId")?.trim();
  return playerId ? playerId : undefined;
};
