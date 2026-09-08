// The "Show Hints" settings-panel row, mirroring
// client-audio-settings-ui.ts's structure. Toggles the same global
// discovery-tip mute the toast's "don't show tooltips" checkbox sets
// (client-discovery-tips-storage.ts), now server-persisted (see
// client-hint-server-sync.ts) so the choice survives a browser data clear
// or a different device instead of only living in localStorage.
import { clearDiscoveryTipsMute, isDiscoveryTipsMuted, muteDiscoveryTips } from "./client-discovery-tips-storage.js";

export const hintsSettingsFieldHtml = (authEmail?: string | null): string => `
        <div class="settings-hints-field">
          <label>
            <p>Show Hints</p>
            <div class="row settings-hints-row">
              <input type="checkbox" data-settings-hints-enabled ${isDiscoveryTipsMuted(authEmail) ? "" : "checked"} />
            </div>
          </label>
        </div>`;

/** Binds the checkbox rendered by hintsSettingsFieldHtml() within `root`. */
export const bindHintsSettingsControls = (root: ParentNode, authEmail?: string | null): void => {
  (root.querySelectorAll("[data-settings-hints-enabled]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.onchange = () => {
      if (input.checked) clearDiscoveryTipsMute(authEmail);
      else muteDiscoveryTips(authEmail);
    };
  });
};
