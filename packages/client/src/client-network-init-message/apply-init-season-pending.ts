import type { ClientState } from "../client-state/client-state.js";

// Extracted from client-network-init-message.ts (over its 500-line cap).
// Set directly from INIT (not just in response to a JOIN_SEASON rejection)
// so a reconnecting client who was already waiting in the pending-season
// lobby goes straight back to the countdown screen instead of showing the
// generic "Join Season?" prompt and only discovering the season is pending
// after a separate round trip. See gateway-app.ts's PreparePlayer handling.
// Also carries the same roster/count shape as the SEASON_LOBBY_UPDATE
// broadcast (see client-network.ts), so a reconnecting client shows the real
// waiting-room state immediately instead of an empty roster until the next
// broadcast happens to arrive.
export const applyInitSeasonPending = (
  state: Pick<ClientState, "seasonPending" | "seasonPendingScheduledStartAt" | "seasonLobbyWaitingCount" | "seasonLobbyMaxPlayers" | "seasonLobbyRoster">,
  msg: unknown
): void => {
  const initSeasonPending = Boolean((msg as { seasonPending?: unknown }).seasonPending);
  if (!initSeasonPending) {
    state.seasonPending = false;
    return;
  }
  state.seasonPending = true;
  const scheduledStartAt = (msg as { seasonPendingScheduledStartAt?: unknown }).seasonPendingScheduledStartAt;
  state.seasonPendingScheduledStartAt = typeof scheduledStartAt === "number" ? scheduledStartAt : Date.now();
  const waitingCount = (msg as { seasonLobbyWaitingCount?: unknown }).seasonLobbyWaitingCount;
  const maxPlayers = (msg as { seasonLobbyMaxPlayers?: unknown }).seasonLobbyMaxPlayers;
  const roster = (msg as { seasonLobbyRoster?: unknown }).seasonLobbyRoster;
  if (typeof waitingCount === "number") state.seasonLobbyWaitingCount = waitingCount;
  if (typeof maxPlayers === "number") state.seasonLobbyMaxPlayers = maxPlayers;
  if (Array.isArray(roster)) state.seasonLobbyRoster = roster as typeof state.seasonLobbyRoster;
};
