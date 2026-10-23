import { signOut, type Auth } from "firebase/auth";
import type { ClientState } from "../client-state/client-state.js";
import { openAccountDeletion } from "../client-account-deletion/client-account-deletion.js";
import "../client-account-deletion/client-account-deletion.css";

/** Account actions and navigation share one binder; game HUD rerenders do not own the deletion dialog. */
export const bindAccountSettingsControls = (
  root: HTMLElement, auth: Auth | null | undefined, state: ClientState, wsUrl: string, rerender: () => void
): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-auth-logout]").forEach((button) => {
    button.onclick = async () => {
      if (!auth) return;
      await signOut(auth);
      window.location.reload();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-settings-nav]").forEach((button) => {
    button.onclick = () => {
      const page = button.dataset.settingsNav;
      if (page !== "account" && page !== "gameplay" && page !== "notifications" && page !== "diagnostics" && page !== "admin") return;
      state.settingsSubPage = page;
      rerender();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-settings-back]").forEach((button) => {
    button.onclick = () => { state.settingsSubPage = null; rerender(); };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-account-delete]").forEach((button) => {
    button.onclick = () => { if (auth) openAccountDeletion(auth, wsUrl); };
  });
};
