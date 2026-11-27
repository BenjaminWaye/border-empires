// The way back to the join card. Without the automatic join (GDD §6) a player
// who pressed "Wait for the next contest" or closed the card had no way to
// open it again short of reloading. A small button stays on screen while the
// player has not joined the running contest and the card is closed.
import "./client-join-season-reopen.css";

const BUTTON_ID = "join-season-reopen";

export type JoinSeasonReopenState = {
  needsSeasonJoin: boolean;
  joinSeasonOverlayOpen: boolean;
  profileSetupRequired: boolean;
  seasonWinner?: unknown;
};

export const shouldShowJoinSeasonReopen = (state: JoinSeasonReopenState): boolean =>
  state.needsSeasonJoin && !state.joinSeasonOverlayOpen && !state.profileSetupRequired && !state.seasonWinner;

export const syncJoinSeasonReopenButton = (state: JoinSeasonReopenState, reopen: () => void, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void => {
  if (!doc) return;
  const existing = doc.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!shouldShowJoinSeasonReopen(state)) {
    existing?.remove();
    return;
  }
  const button = existing ?? doc.createElement("button");
  if (!existing) {
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "panel-btn join-season-reopen";
    button.textContent = "Join this Sector Contest";
    (doc.getElementById("hud") ?? doc.body).append(button);
  }
  button.onclick = reopen;
};
