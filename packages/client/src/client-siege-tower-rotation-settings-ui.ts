// The "Siege Tower Aim" settings-panel field (lens-only vs whole-tower
// rotation for the upgraded siege towers on the 3D map) and its bindings, split
// out of client-hud.ts (already over the repo's per-file line cap) so the HUD
// only needs a one-line call — same split as client-audio-settings-ui.ts.
import {
  setSiegeTowerRotationMode,
  siegeTowerRotationMode,
  type SiegeTowerRotationMode
} from "./client-siege-tower-rotation-mode.js";

export const siegeTowerRotationSettingsFieldHtml = (): string => {
  const current = siegeTowerRotationMode();
  return `
    <div class="settings-siege-tower-field">
      <label>
        <p>Siege Tower Aim</p>
        <div class="row settings-siege-tower-row">
          <select data-siege-tower-rotation-mode>
            <option value="lens" ${current === "lens" ? "selected" : ""}>Rotate just the aether lens</option>
            <option value="structure" ${current === "structure" ? "selected" : ""}>Rotate the whole tower</option>
          </select>
        </div>
        <p class="settings-field-hint">How a siege tower sights the latest ongoing battle.</p>
      </label>
    </div>`;
};

/** Binds the select rendered by siegeTowerRotationSettingsFieldHtml() within `root`. `onChanged` re-renders the HUD so the option stays in sync. */
export const bindSiegeTowerRotationSettingsControls = (root: ParentNode, onChanged: () => void): void => {
  (root.querySelectorAll("[data-siege-tower-rotation-mode]") as NodeListOf<HTMLSelectElement>).forEach((select) => {
    select.onchange = () => {
      const next = select.value as SiegeTowerRotationMode;
      setSiegeTowerRotationMode(next);
      onChanged();
    };
  });
};