import { resetVictoryHoldAlertForNewSeason } from "../client-alerts/client-alerts.js";
import { clearStoredDiscoveredTiles } from "../client-state/client-discovered-tiles-storage.js";
import type { ClientState } from "../client-state/client-state.js";
import { clearCameraLocation } from "../client-view-refresh.js";

type RolloverState = Pick<
  ClientState,
  | "tiles"
  | "discoveredTiles"
  | "leaderboard"
  | "seasonWinner"
  | "seasonVictory"
  | "seasonStats"
  | "seasonScoreHistory"
  | "seasonEndDismissed"
  | "seasonEndStarting"
  | "seasonStartVoteCount"
  | "seasonStartVoted"
  | "victoryHoldAlert"
  | "victoryHoldAlertCollapsed"
  | "acknowledgedVictoryHoldAlertKeys"
  | "camX"
  | "camY"
  | "camSubX"
  | "camSubY"
>;

// Drops everything the client holds about the previous season: map tiles,
// leaderboard, victory standings, season-end screen and camera position. The
// server then repopulates it (INIT, chunks, GLOBAL_STATUS_UPDATE). Without
// this a tab that was open through a rollover keeps showing the old season's
// leaderboard and tiles, because the new season sends nothing that overwrites
// a list it never mentions.
export const resetClientForNewSeason = (state: RolloverState): void => {
  state.tiles.clear(); // callers re-derive render caches from state.tiles afterwards, so clear it first
  state.discoveredTiles.clear();
  state.leaderboard = { overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] };
  state.seasonWinner = undefined;
  state.seasonVictory = [];
  state.seasonStats = undefined;
  state.seasonScoreHistory = [];
  resetVictoryHoldAlertForNewSeason(state);
  state.seasonEndDismissed = false;
  state.seasonEndStarting = false;
  state.seasonStartVoteCount = 0;
  state.seasonStartVoted = false;
  clearCameraLocation();
  clearStoredDiscoveredTiles();
  state.camX = 0;
  state.camY = 0;
  state.camSubX = 0;
  state.camSubY = 0;
};

// Called on every INIT. `bridgeDebugSeasonId` is the season the client last
// initialised against ("" on a fresh page load, when there is nothing stale in
// memory). A different incoming season means a rollover happened while this
// session was connected, or while its socket was down and reconnected in place.
// Returns true in that case so INIT can re-centre the camera on the new home tile.
export const applySeasonChangeOnInit = (
  state: RolloverState & Pick<ClientState, "bridgeDebugSeasonId" | "cameraRestoredSeasonId" | "cameraRestoredFromStorage">,
  incomingSeasonId: string | undefined
): boolean => {
  if (!incomingSeasonId) return false;
  if (state.bridgeDebugSeasonId !== "" && state.bridgeDebugSeasonId !== incomingSeasonId) {
    resetClientForNewSeason(state);
    state.cameraRestoredFromStorage = false;
    return true;
  }
  // The season may also have rolled while the tab was closed: nothing is held
  // in memory then, but the saved camera carries the season it was saved in.
  const savedCameraSeasonId = state.cameraRestoredSeasonId;
  if (state.bridgeDebugSeasonId === "" && savedCameraSeasonId !== undefined && savedCameraSeasonId !== "" && savedCameraSeasonId !== incomingSeasonId) {
    clearCameraLocation();
    state.cameraRestoredFromStorage = false;
    clearStoredDiscoveredTiles();
  }
  return false;
};
