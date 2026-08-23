// Extracted from client-network.ts's JOIN_SEASON_ACK handler to keep that
// (already oversized) file from growing -- see AGENTS.md's 500-line cap.
//
// A live (mid-session) JOIN_SEASON spawn is the one case where the camera
// legitimately overrides a restored/persisted position: the player had no
// territory when that camera position was saved, so it's meaningless now.
// No second INIT is sent after JOIN_SEASON_ACK (see
// handle-join-season-message.ts on the gateway), so state.homeTile would
// otherwise never get set for a spawn that happens after the initial
// connect -- see centerOnOwnedTile() in client-view-refresh.ts, which falls
// back to homeTile precisely because the chunk containing the new tiles
// hasn't loaded yet (the camera was elsewhere when chunks were last
// subscribed).
import { clearCameraLocation } from "./client-view-refresh.js";
import type { ClientState } from "./client-state/client-state.js";

export const applyJoinSeasonSpawnRecenter = (
  state: Pick<ClientState, "homeTile" | "camX" | "camY" | "selected">,
  spawnTile: { x: number; y: number } | undefined,
  requestViewRefreshSafely: (radius?: number, force?: boolean) => void
): void => {
  if (!spawnTile) return;
  state.homeTile = spawnTile;
  state.camX = spawnTile.x;
  state.camY = spawnTile.y;
  state.selected = spawnTile;
  // The stale pre-spawn camera in localStorage is worse than useless here --
  // reload it and the player lands back on the meaningless position this
  // just overrode. Clear it so a reload instead falls through to the normal
  // homeTile-driven INIT recenter.
  clearCameraLocation();
  requestViewRefreshSafely(undefined, true);
};
