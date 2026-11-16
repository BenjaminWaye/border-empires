// "Needs a field" toasts above your refineries (docs/territory-development-
// plan.md, Phase 2, Client): an active refinery whose link is broken, whose
// field was lost or taken, or which never had one, gets a toast in the DOM
// plate layer drawn over both map renderers (like the town plates' unruly
// badge and the salvage toasts). Tapping it opens the field picker.
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { refineryStatusFor, type RefineryNeedsField } from "./refinery-client-status.js";
import { openRefineryChangeFieldPicker } from "./refinery-picker-flow.js";
import "./refinery-field-toasts.css";

interface MapTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
type ToastState = Pick<ClientState, "tiles" | "tilesRevision" | "me" | "authSessionReady" | "profileSetupRequired" | "selected">;

const MAX_TOASTS = 64;

export const REFINERY_TOAST_TEXT: Readonly<Record<RefineryNeedsField, string>> = {
  UNLINKED: "Link broken · choose field",
  NO_FIELD: "Needs a field",
  FIELD_LOST: "Field lost · choose field",
  FIELD_TAKEN: "Field taken · choose field"
};

export type RefineryToast = { readonly key: string; readonly x: number; readonly y: number; readonly reason: RefineryNeedsField; readonly text: string };

/** The toast for your refinery on this tile, or undefined when it is working (or not yours, or not a refinery). */
export const refineryToastFor = (state: Pick<ClientState, "tiles" | "tilesRevision" | "me">, tile: Tile | undefined): RefineryToast | undefined => {
  const status = refineryStatusFor(state, tile);
  if (!tile || !status?.needsField || status.ownerId !== state.me) return undefined;
  return { key: status.key, x: tile.x, y: tile.y, reason: status.needsField, text: REFINERY_TOAST_TEXT[status.needsField] };
};

/** Screen-space toasts over either map renderer, fed the frame's visible tiles and real projection. */
export function createRefineryFieldToasts(canvas: HTMLCanvasElement, state: ToastState, openPicker: (tile: Tile) => boolean = (tile) => openRefineryChangeFieldPicker(tile)): {
  render: (tiles: readonly MapTile[], projection: Projection) => void;
  dispose: () => void;
} {
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "refinery-toast-layer";
  layer.setAttribute("aria-label", "Refineries needing a field");
  canvas.parentElement?.append(layer);
  const buttons = new Map<string, HTMLButtonElement>();
  return {
    render(tiles, { size, project }) {
      const shown = new Set<string>();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible" || shown.size >= MAX_TOASTS) continue;
        const toast = refineryToastFor(state, t);
        if (!toast || !t) continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        // Same lift as the salvage toast: clear of the district model in 3D, above the tile in 2D.
        const lift = three ? Math.max(28, size * 1.4) : Math.max(28, size * 0.45 + 8);
        const x = at.sx * scaleX, y = (at.sy - lift) * scaleY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        shown.add(wk);
        let button = buttons.get(wk);
        if (!button) {
          button = canvas.ownerDocument.createElement("button");
          button.type = "button";
          button.className = "refinery-toast";
          button.onpointerdown = event => event.stopPropagation();
          layer.append(button);
          buttons.set(wk, button);
        }
        const tile = t;
        button.onclick = event => { event.stopPropagation(); state.selected = { x: tile.x, y: tile.y }; openPicker(tile); };
        if (button.textContent !== toast.text) button.textContent = toast.text;
        if (button.dataset.reason !== toast.reason) button.dataset.reason = toast.reason;
        const label = `Refinery at ${toast.x}, ${toast.y}: ${toast.text}`;
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (button.style.left !== `${x}px`) button.style.left = `${x}px`;
        if (button.style.top !== `${y}px`) button.style.top = `${y}px`;
      }
      for (const [key, button] of buttons) if (!shown.has(key)) { button.remove(); buttons.delete(key); }
    },
    dispose() { buttons.clear(); layer.remove(); }
  };
}
