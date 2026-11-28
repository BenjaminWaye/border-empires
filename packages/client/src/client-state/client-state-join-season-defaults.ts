import type { SectorListRow } from "../client-sector-list/client-sector-list.js";

/**
 * Join card state, extracted out of client-state.ts (at the file-line cap).
 * The join-season overlay, the SEASON_PENDING countdown and lobby roster
 * (client-join-season-overlay.ts / client-season-lobby-panel.ts);
 * seasonStartedAt/singleContest/joinSeasonClosedMessage: the honest join card
 * and NO_LANDING_SITE (client-join-season-late-join.ts); sectorList*: the
 * card's sector list (client-sector-list/); joinSeasonWaiting: the player
 * pressed "Wait for the next contest" and the card shows the waiting view
 * (client-join-season-waiting/).
 */
export const createInitialJoinSeasonState = () => ({
  needsSeasonJoin: false,
  joinSeasonOverlayOpen: false,
  joinSeasonId: "" as string,
  joinSeasonPending: false,
  joinSeasonWaiting: false,
  seasonPending: false,
  seasonPendingScheduledStartAt: 0,
  seasonStartedAt: 0,
  singleContest: false,
  joinSeasonClosedMessage: "" as string,
  sectorListRows: [] as SectorListRow[],
  sectorListLoadedFor: "" as string,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [] as { playerId: string; name: string; title?: string }[]
});
