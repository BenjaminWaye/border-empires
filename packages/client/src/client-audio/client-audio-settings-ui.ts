// The "Ambient Sound" settings-panel row (toggle + volume slider) and its
// bindings, split out of client-hud.ts (already over the repo's per-file
// line cap) so the HUD only needs a one-line call for each.
import { settingsSliderHtml, settingsToggleRowHtml, syncSettingsSliderFill } from "../client-hud/client-settings-controls.js";
import { getAmbientAudioVolume, isAmbientAudioMuted, setAmbientAudioMuted, setAmbientAudioVolume, startAmbientAudio } from "./client-audio.js";

export const audioSettingsFieldHtml = (): string => {
  const muted = isAmbientAudioMuted();
  return `
        <div class="settings-audio-field">
          ${settingsToggleRowHtml({ attrs: "data-settings-audio-enabled", checked: !muted, title: "Background Music" })}
          <div class="row settings-audio-row">
            ${settingsSliderHtml({ attrs: "data-settings-audio-volume", min: 0, max: 100, step: 5, value: Math.round(getAmbientAudioVolume() * 100), ariaLabel: "Music volume", disabled: muted })}
          </div>
        </div>`;
};

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
    input.oninput = () => {
      syncSettingsSliderFill(input);
      setAmbientAudioVolume(Number(input.value) / 100);
    };
  });
};
