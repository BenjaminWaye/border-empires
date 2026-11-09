import type { ClientState } from "../client-state/client-state.js";

// Join outcomes the gateway reports as ERROR codes. Both stop the "Joining..."
// spinner and redraw straight away: the join overlay is rebuilt only when its
// render key changes, so clearing the flag without a renderHud() left the
// spinner up indefinitely.
//
// JOIN_SEASON_ENDED is join-specific on purpose. SEASON_ENDED is already used
// for frontier commands rejected after the season freeze, and those must keep
// going through the generic action-failure cleanup.
//
// On JOIN_SEASON_ENDED the prompt is closed (the player can't join until a
// new season starts; the season-end screen shows once the winner arrives).
// Neither case swallows the ERROR, so the caller's generic handler still
// surfaces the gateway's message to the player.
export const applyJoinSeasonErrorCode = (
  state: Pick<ClientState, "joinSeasonPending" | "joinSeasonOverlayOpen">,
  code: string,
  renderHud: () => void
): void => {
  if (code !== "JOIN_SEASON_FAILED" && code !== "JOIN_SEASON_ENDED") return;
  state.joinSeasonPending = false;
  if (code === "JOIN_SEASON_ENDED") state.joinSeasonOverlayOpen = false;
  renderHud();
};
