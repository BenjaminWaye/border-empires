// The "Breach Edge Style" field on Settings > Admin: switches the 3D incursion
// pocket outline between the straight strip and the candidate breach looks (client-incursion-breach-style.ts) so they can be compared in-game.
// Admin-only while the look is being chosen.
import {
  INCURSION_BREACH_STYLES,
  incursionBreachStyle,
  isIncursionBreachStyle,
  setIncursionBreachStyle,
  type IncursionBreachStyle
} from "./client-incursion-breach-style.js";

const LABELS: Readonly<Record<IncursionBreachStyle, string>> = {
  straight: "Straight outline (current)",
  ember: "Ember seam",
  ink: "Ink bleed",
  veil: "Aether veil"
};

export const incursionBreachSettingsFieldHtml = (current: IncursionBreachStyle = incursionBreachStyle()): string => `
    <div class="settings-incursion-breach-field">
      <label>
        <p>Breach Edge Style</p>
        <div class="row">
          <select data-incursion-breach-style>
            ${INCURSION_BREACH_STYLES.map((style) => `<option value="${style}" ${style === current ? "selected" : ""}>${LABELS[style]}</option>`).join("")}
          </select>
        </div>
        <p class="settings-field-hint">How rival land inside your reach is outlined where it borders your own tiles (3D map). Only on this device.</p>
      </label>
    </div>`;

/** Binds the select rendered by incursionBreachSettingsFieldHtml() within `root`. The 3D map redraws on its own (see client-map-3d-rebuild-triggers.ts). */
export const bindIncursionBreachSettingsControls = (root: ParentNode, onChanged: () => void): void => {
  (root.querySelectorAll("[data-incursion-breach-style]") as NodeListOf<HTMLSelectElement>).forEach((select) => {
    select.onchange = () => {
      if (!isIncursionBreachStyle(select.value)) return;
      setIncursionBreachStyle(select.value);
      onChanged();
    };
  });
};
