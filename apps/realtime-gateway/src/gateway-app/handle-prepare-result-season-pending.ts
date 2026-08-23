import { buildSeasonLobbyUpdatePayload, type SeasonLobbyUpdatePayload } from "../season-lobby-broadcast/season-lobby-broadcast.js";

export type PrepareResultSeasonPendingDeps = {
  checkIntoLobby: (playerId: string) => Promise<{ name: string; countryFlag?: string }>;
  broadcastLobbyUpdate: () => void;
  rosterEntries: () => { playerId: string; name: string; countryFlag?: string }[];
};

// Extracted from the AUTH handler's PrepareResult branch (gateway-app.ts is
// already over its 500-line cap). Re-establishes this player in the
// waiting-room roster on reconnect (a no-op if they're already checked in --
// checkIn is idempotent) and tells everyone else waiting that they're back,
// so the INIT fast-path never hands this client (or anyone already waiting)
// a stale/empty roster. Returns the roster snapshot to embed directly in
// this client's own INIT payload.
export const handlePrepareResultSeasonPending = async (playerId: string, deps: PrepareResultSeasonPendingDeps): Promise<SeasonLobbyUpdatePayload> => {
  await deps.checkIntoLobby(playerId);
  const payload = buildSeasonLobbyUpdatePayload(deps.rosterEntries());
  deps.broadcastLobbyUpdate();
  return payload;
};
