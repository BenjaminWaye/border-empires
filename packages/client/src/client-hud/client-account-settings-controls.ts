import { Capacitor } from "@capacitor/core";
import { signOut, type Auth } from "firebase/auth";
import type { ClientState } from "../client-state/client-state.js";
import { openAccountDeletion } from "../client-account-deletion/client-account-deletion.js";
import "../client-account-deletion/client-account-deletion.css";
import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";

export const GUEST_LOGOUT_WARNING = "Log out? This guest empire can't be recovered.\n\nCancel to save it instead.";

/** Account actions and navigation share one binder; game HUD rerenders do not own the deletion dialog. */
export const bindAccountSettingsControls = (
  root: HTMLElement, auth: Auth | null | undefined, state: ClientState, wsUrl: string, rerender: () => void
): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-auth-logout]").forEach((button) => {
    button.onclick = async () => {
      if (!auth) return;
      // A guest (anonymous) account has no way to sign back in, so logging out abandons the empire.
      // Cancel opens the save panel, which also explains when saving isn't possible here.
      if (auth.currentUser?.isAnonymous && !window.confirm(GUEST_LOGOUT_WARNING)) {
        openGuestSavePanel("badge");
        return;
      }
      await signOut(auth);
      if (Capacitor.isNativePlatform()) {
        // Also forget the native Google/Apple session so the next sign-in offers the account picker.
        const { signOutNativeSso } = await import("../client-native-sso/client-native-sso.js");
        await signOutNativeSso();
      }
      window.location.reload();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-settings-guest-save]").forEach((button) => {
    button.onclick = () => openGuestSavePanel("badge");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-settings-nav]").forEach((button) => {
    button.onclick = () => {
      const page = button.dataset.settingsNav;
      if (page !== "account" && page !== "gameplay" && page !== "notifications" && page !== "diagnostics" && page !== "admin" && page !== "credits") return;
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
