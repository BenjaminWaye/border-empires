// Binds the waiting view's email buttons (client-join-season-waiting.ts). The
// close and Land now buttons share the join card's own bindings.
import { setEmailNotificationPref } from "../client-email-notifications/client-email-notification-prefs-storage.js";
import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";

export type JoinWaitingBindDeps = {
  state: { joinSeasonOverlayOpen: boolean };
  renderHud: () => void;
  setSeasonStartEmail?: (enabled: boolean) => void;
  openGuestSave?: () => void;
};

export const bindJoinWaiting = (overlayEl: ParentNode, deps: JoinWaitingBindDeps): void => {
  const emailBtn = overlayEl.querySelector("#join-waiting-email") as HTMLButtonElement | null;
  if (emailBtn) {
    emailBtn.onclick = () => {
      // The card's render key includes this preference, so the redraw shows the confirmation.
      (deps.setSeasonStartEmail ?? ((enabled: boolean) => setEmailNotificationPref("seasonStart", enabled)))(true);
      deps.renderHud();
    };
  }
  const saveBtn = overlayEl.querySelector("#join-waiting-save") as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.onclick = () => {
      // The card covers the whole HUD (season-lobby-active), so it closes for the save panel to show.
      deps.state.joinSeasonOverlayOpen = false;
      deps.renderHud();
      (deps.openGuestSave ?? (() => openGuestSavePanel("contest-email")))();
    };
  }
};
