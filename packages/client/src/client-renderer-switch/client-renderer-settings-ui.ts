// The "Map Renderer" settings-panel field: says which renderer is running and
// offers the switch to the other one. This is the permanent, discoverable way
// back to 3D — the banners (client-renderer-fallback-notice.ts) are
// dismissible and once-per-session, so they can't be the only route.
import { activeRendererKind, switchRenderer, type ActiveRendererKind, type RendererTarget } from "./client-renderer-switch.js";

type FieldCopy = { readonly status: string; readonly hint: string; readonly target: RendererTarget; readonly button: string };

const COPY: Record<ActiveRendererKind, FieldCopy> = {
  "3d": {
    status: "Currently: 3D map.",
    hint: "Switch to the lighter 2D map if the game runs slowly on this device. Switching reloads the page.",
    target: "2d",
    button: "Switch to 2D map"
  },
  "2d-chosen": {
    status: "Currently: 2D map.",
    hint: "The 3D map is the default and looks best on most devices. Switching reloads the page.",
    target: "3d",
    button: "Switch to 3D map"
  },
  "2d-fallback": {
    status: "Currently: 2D map — the 3D map couldn't start on this device.",
    hint: "You can try 3D again. If it still can't start you'll land back on 2D. Switching reloads the page.",
    target: "3d",
    button: "Try 3D map again"
  }
};

export const rendererSettingsFieldHtml = (kind: ActiveRendererKind = activeRendererKind()): string => {
  const copy = COPY[kind];
  return `
    <div class="settings-renderer-field">
      <p>Map Renderer</p>
      <p class="settings-renderer-status">${copy.status}</p>
      <div class="row settings-renderer-row">
        <button type="button" class="panel-btn" data-renderer-switch="${copy.target}">${copy.button}</button>
      </div>
      <p class="settings-field-hint">${copy.hint}</p>
    </div>`;
};

/** Binds the button rendered by rendererSettingsFieldHtml() within `root`. */
export const bindRendererSettingsControls = (root: ParentNode): void => {
  (root.querySelectorAll("[data-renderer-switch]") as NodeListOf<HTMLButtonElement>).forEach((button) => {
    button.onclick = () => switchRenderer(button.dataset.rendererSwitch === "3d" ? "3d" : "2d");
  });
};
