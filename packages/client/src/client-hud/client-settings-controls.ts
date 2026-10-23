// Brass toggle switches and sliders for the Settings pages, replacing the
// browser-native checkbox / range inputs (styled by
// client-settings-controls-style.css). They still wrap a real <input>, so the
// per-field binders keep reading `.checked` / `.value` and keyboard + screen
// reader behaviour comes from the native control.

export type SettingsToggleRowOptions = {
  /** Data attribute(s) the field's binder selects on, e.g. `data-settings-hints-enabled`. */
  readonly attrs: string;
  readonly checked: boolean;
  readonly title: string;
  readonly hint?: string;
  readonly disabled?: boolean;
};

export const settingsToggleRowHtml = (options: SettingsToggleRowOptions): string => `
  <label class="settings-toggle-row${options.disabled ? " is-disabled" : ""}">
    <span class="settings-toggle-text">
      <span class="settings-toggle-title">${options.title}</span>
      ${options.hint ? `<span class="settings-field-hint">${options.hint}</span>` : ""}
    </span>
    <span class="settings-toggle">
      <input type="checkbox" class="settings-toggle-input" ${options.attrs} ${options.checked ? "checked" : ""} ${options.disabled ? "disabled" : ""} />
      <span class="settings-toggle-track" aria-hidden="true"><span class="settings-toggle-thumb"></span></span>
    </span>
  </label>`;

export type SettingsSliderOptions = {
  readonly attrs: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
};

export const settingsSliderFillPercent = (value: number, min: number, max: number): number =>
  max <= min ? 0 : Math.round((Math.min(max, Math.max(min, value)) - min) / (max - min) * 100);

export const settingsSliderHtml = (options: SettingsSliderOptions): string => `
  <input type="range" class="settings-slider" min="${options.min}" max="${options.max}" step="${options.step}" value="${options.value}"
    style="--settings-slider-fill: ${settingsSliderFillPercent(options.value, options.min, options.max)}%"
    aria-label="${options.ariaLabel}" ${options.disabled ? "disabled" : ""} ${options.attrs} />`;

/** Keeps the brass fill in step with the thumb while dragging (the track gradient reads a CSS var). */
export const syncSettingsSliderFill = (input: HTMLInputElement): void => {
  const fill = settingsSliderFillPercent(Number(input.value), Number(input.min), Number(input.max));
  input.style.setProperty("--settings-slider-fill", `${fill}%`);
};
