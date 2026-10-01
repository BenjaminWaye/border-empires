// The Settings > Admin "Lighting Tuner" card: sliders and colour pickers that
// drive the live 3D map lights (see client-lighting-tuner-settings.ts). Pure
// HTML builder plus its own binder, following the same split as
// client-audio-settings-ui.ts, so client-hud.ts only needs one call.
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import {
  DEFAULT_LIGHTING,
  LIGHTING_NUMBER_RANGES,
  getLightingSettings,
  lightingSettingsAsSource,
  resetLightingSettings,
  setLightingSetting,
  type LightingColorKey,
  type LightingNumberKey
} from "./client-lighting-tuner-settings.js";

type Control =
  | { readonly kind: "number"; readonly key: LightingNumberKey; readonly label: string }
  | { readonly kind: "color"; readonly key: LightingColorKey; readonly label: string };

const GROUPS: ReadonlyArray<{ readonly title: string; readonly controls: ReadonlyArray<Control> }> = [
  {
    title: "Sun (key light)",
    controls: [
      { kind: "number", key: "sunIntensity", label: "Intensity" },
      { kind: "color", key: "sunColor", label: "Colour" },
      { kind: "number", key: "sunAzimuthDeg", label: "Direction °" },
      { kind: "number", key: "sunElevationDeg", label: "Height °" },
      { kind: "number", key: "shadowIntensity", label: "Shadow strength" }
    ]
  },
  {
    title: "Sky fill (hemisphere)",
    controls: [
      { kind: "number", key: "hemiIntensity", label: "Intensity" },
      { kind: "color", key: "hemiSkyColor", label: "Sky colour" },
      { kind: "color", key: "hemiGroundColor", label: "Ground colour" }
    ]
  },
  {
    title: "Back fill",
    controls: [
      { kind: "number", key: "fillIntensity", label: "Intensity" },
      { kind: "color", key: "fillColor", label: "Colour" }
    ]
  },
  {
    title: "Whole scene",
    controls: [
      { kind: "number", key: "envIntensity", label: "Metal reflections" },
      { kind: "number", key: "exposure", label: "Exposure" }
    ]
  }
];

const formatNumber = (value: number): string => (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2));

const controlHtml = (control: Control): string => {
  const settings = getLightingSettings();
  if (control.kind === "color") {
    return `
      <label class="lighting-tuner-row">
        <span>${control.label}</span>
        <input type="color" value="${settings[control.key]}" data-lighting-color="${control.key}" />
      </label>`;
  }
  const range = LIGHTING_NUMBER_RANGES[control.key];
  const value = settings[control.key];
  return `
    <label class="lighting-tuner-row">
      <span>${control.label}</span>
      <input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-lighting-number="${control.key}" />
      <output data-lighting-output="${control.key}">${formatNumber(value)}</output>
    </label>`;
};

export const lightingTunerCardHtml = (): string => {
  const rendererNote = isTrue3DRendererActive()
    ? ""
    : "<p>The 3D map isn't active in this browser, so these only take effect once it is.</p>";
  return `
    <div class="lighting-tuner">
      <p><strong>Lighting Tuner</strong></p>
      <p>Adjusts the 3D map lights live. Saved in this browser only — copy the values and send them over to make them the default.</p>
      ${rendererNote}
      ${GROUPS.map((group) => `<p class="lighting-tuner-group">${group.title}</p>${group.controls.map(controlHtml).join("")}`).join("")}
      <button type="button" class="panel-btn" data-lighting-copy>Copy Values</button>
      <button type="button" class="panel-btn" data-lighting-reset>Reset to Shipped</button>
    </div>
  `;
};

const isLightingNumberKey = (key: string | undefined): key is LightingNumberKey =>
  key !== undefined && key in LIGHTING_NUMBER_RANGES;
const isLightingColorKey = (key: string | undefined): key is LightingColorKey =>
  key !== undefined && typeof DEFAULT_LIGHTING[key as LightingColorKey] === "string";

/** Binds the controls rendered by lightingTunerCardHtml() within `root`. `onChanged` re-renders the HUD (used by Reset, which has to move every control back). */
export const bindLightingTunerControls = (root: ParentNode, onChanged: () => void): void => {
  (root.querySelectorAll("[data-lighting-number]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.oninput = () => {
      const key = input.dataset.lightingNumber;
      if (!isLightingNumberKey(key)) return;
      setLightingSetting(key, Number(input.value));
      // The HUD can hold more than one copy of this card (desktop + mobile
      // layouts), so update this input's own readout rather than the first match.
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = formatNumber(getLightingSettings()[key]);
      // Deliberately no re-render: it would rebuild the slider mid-drag and drop the pointer.
    };
  });
  (root.querySelectorAll("[data-lighting-color]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.oninput = () => {
      const key = input.dataset.lightingColor;
      if (isLightingColorKey(key)) setLightingSetting(key, input.value);
    };
  });
  const resetButton = root.querySelector("[data-lighting-reset]") as HTMLButtonElement | null;
  if (resetButton) {
    resetButton.onclick = () => {
      resetLightingSettings();
      onChanged();
    };
  }
  const copyButton = root.querySelector("[data-lighting-copy]") as HTMLButtonElement | null;
  if (copyButton) {
    copyButton.onclick = () => {
      const source = lightingSettingsAsSource(getLightingSettings());
      if (!navigator.clipboard) {
        copyButton.textContent = "Clipboard unavailable";
        return;
      }
      navigator.clipboard.writeText(source).then(
        () => {
          copyButton.textContent = "Copied";
        },
        () => {
          copyButton.textContent = "Copy failed";
        }
      );
    };
  }
};
