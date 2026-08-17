// The "Ambient Sound" settings-panel row (checkbox + volume slider) and its
// bindings, split out of client-hud.ts (already over the repo's per-file
// line cap) so the HUD only needs a one-line call for each.
import { getAmbientAudioVolume, isAmbientAudioMuted, setAmbientAudioMuted, setAmbientAudioVolume, startAmbientAudio } from "./client-audio.js";

export const audioSettingsFieldHtml = (): string => `
        <div class="settings-audio-field">
          <label>
            <p>Background Music</p>
            <div class="row settings-audio-row">
              <input type="checkbox" data-settings-audio-enabled ${isAmbientAudioMuted() ? "" : "checked"} />
              <input type="range" min="0" max="100" step="5" value="${Math.round(getAmbientAudioVolume() * 100)}" ${isAmbientAudioMuted() ? "disabled" : ""} data-settings-audio-volume />
            </div>
          </label>
        </div>`;

/** Binds the checkbox/slider rendered by audioSettingsFieldHtml() within `root`. `onChanged` re-renders the HUD so a toggled mute also disables/enables the slider. */
export const bindAudioSettingsControls = (root: ParentNode, onChanged: () => void): void => {
  (root.querySelectorAll("[data-settings-audio-enabled]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.onchange = () => {
      setAmbientAudioMuted(!input.checked);
      if (input.checked) startAmbientAudio();
      onChanged();
    };
  });
  (root.querySelectorAll("[data-settings-audio-volume]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.oninput = () => setAmbientAudioVolume(Number(input.value) / 100);
  });
};
