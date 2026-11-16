import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { salvageTributeStatus, type SalvageTributeState } from "./client-salvage-tribute.js";
import { showSalvageTributeSheet } from "./client-salvage-tribute-sheet.js";
import { groupSalvageToasts, salvageToastLabel, salvageToastModeFor, salvageToastText, type PlacedSalvageToast } from "./client-salvage-toast-layout.js";
import "./client-salvage-ready-toasts.css";

interface MapTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
type ToastState = SalvageTributeState & Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "selected">;

export interface SalvageToast { readonly key: string; readonly x: number; readonly y: number; readonly loads: number; readonly ready: boolean }

const MAX_TOASTS = 128;

/** A toast for each of your working salvage fields that still holds loads; gold when one can ship now. */
export const salvageToastFor = (state: SalvageTributeState, key: string, tile: Tile | undefined): SalvageToast | undefined => {
  const status = salvageTributeStatus(state, tile);
  if (!tile || !status || status.loads <= 0 || tile.ownershipState !== "SETTLED" || tile.economicStructure?.status !== "active") return undefined;
  return { key, x: tile.x, y: tile.y, loads: status.loads, ready: !status.reason };
};

/** Screen-space toasts over either map renderer, fed the frame's visible tiles and real projection. */
export function createSalvageReadyToasts(canvas: HTMLCanvasElement, state: ToastState): {
  render: (tiles: readonly MapTile[], projection: Projection) => void;
  dispose: () => void;
} {
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "salvage-toast-layer";
  layer.setAttribute("aria-label", "Salvage ready to ship");
  canvas.parentElement?.append(layer);
  const buttons = new Map<string, HTMLButtonElement>();
  return {
    render(tiles, { size, project }) {
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      const placed: PlacedSalvageToast[] = [];
      // Both renderers hand us the flat worldToScreen projection, so one tile is `size` canvas px.
      const mode = salvageToastModeFor(size * scaleX);
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible" || placed.length >= MAX_TOASTS) continue;
        const toast = salvageToastFor(state, wk, t);
        if (!toast) continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        // Clear of the Works model in 3D; in 2D a label sits above the tile, a tail-less pip on its top edge.
        const lift = three ? Math.max(20, size * 1.4) : mode === "pip" ? size * 0.5 : Math.max(20, size * 0.45 + 6);
        const x = at.sx * scaleX, y = (at.sy - lift) * scaleY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        placed.push({ toast, x, y });
      }
      const shown = new Set<string>();
      for (const group of groupSalvageToasts(placed, mode)) {
        shown.add(group.key);
        let button = buttons.get(group.key);
        if (!button) {
          button = canvas.ownerDocument.createElement("button");
          button.type = "button";
          button.onpointerdown = event => event.stopPropagation();
          layer.append(button);
          buttons.set(group.key, button);
        }
        const { x: tx, y: ty } = group.target;
        button.onclick = event => { event.stopPropagation(); state.selected = { x: tx, y: ty }; showSalvageTributeSheet({ x: tx, y: ty }); };
        const text = salvageToastText(group, mode);
        if (button.textContent !== text) button.textContent = text;
        const className = `salvage-toast is-${mode}${group.ready ? " is-ready" : ""}`;
        if (button.className !== className) button.className = className;
        const label = salvageToastLabel(group);
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (button.style.left !== `${group.x}px`) button.style.left = `${group.x}px`;
        if (button.style.top !== `${group.y}px`) button.style.top = `${group.y}px`;
      }
      for (const [key, button] of buttons) if (!shown.has(key)) { button.remove(); buttons.delete(key); }
    },
    dispose() { buttons.clear(); layer.remove(); }
  };
}
