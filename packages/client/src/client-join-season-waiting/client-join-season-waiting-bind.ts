// Binds the waiting view's tabs and email buttons (client-join-season-waiting.ts).
// Land now shares the join card's own binding.
import { setEmailNotificationPref } from "../client-email-notifications/client-email-notification-prefs-storage.js";
import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";

export type JoinWaitingBindDeps = {
  renderHud: () => void;
  setSeasonStartEmail?: (enabled: boolean) => void;
  openGuestSave?: () => void;
};

export const JOIN_WAITING_TAB_ATTR = "joinWaitingTab";

/** Tabs switch in place; the chosen one is kept on the overlay so a redraw (new standings) stays on it. */
const bindTabs = (overlayEl: HTMLElement): void => {
  const buttons = Array.from(overlayEl.querySelectorAll("[data-join-waiting-tab]")) as HTMLButtonElement[];
  for (const button of buttons) {
    button.onclick = () => {
      const tab = button.dataset.joinWaitingTab ?? "sectors";
      overlayEl.dataset[JOIN_WAITING_TAB_ATTR] = tab;
      for (const other of buttons) {
        const active = other === button;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
      }
      overlayEl.querySelectorAll("[data-join-waiting-panel]").forEach((panel) => {
        panel.classList.toggle("is-active", (panel as HTMLElement).dataset.joinWaitingPanel === tab);
      });
    };
  }
};

export const bindJoinWaiting = (overlayEl: HTMLElement, deps: JoinWaitingBindDeps): void => {
  bindTabs(overlayEl);
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
      // The save panel shows above the lobby (client-season-lobby-style.css), so the waiting view stays
      // open behind it: a guest who backs out of saving is still waiting, not on the fogged map.
      (deps.openGuestSave ?? (() => openGuestSavePanel("contest-email")))();
    };
  }
};
