import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { salvageTributeStatus, type SalvageTributeState } from "./client-salvage-tribute.js";
import { showSalvageTributeSheet } from "./client-salvage-tribute-sheet.js";
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
      const shown = new Set<string>();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible" || shown.size >= MAX_TOASTS) continue;
        const toast = salvageToastFor(state, wk, t);
        if (!toast) continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        // Same lift as the AFC upgrade badge: clear of the Works model in 3D, above the tile in 2D.
        const lift = three ? Math.max(28, size * 1.4) : Math.max(28, size * 0.45 + 8);
        const x = at.sx * scaleX, y = (at.sy - lift) * scaleY;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        shown.add(wk);
        let button = buttons.get(wk);
        if (!button) {
          button = canvas.ownerDocument.createElement("button");
          button.type = "button";
          button.onpointerdown = event => event.stopPropagation();
          layer.append(button);
          buttons.set(wk, button);
        }
        const { x: tx, y: ty } = toast;
        button.onclick = event => { event.stopPropagation(); state.selected = { x: tx, y: ty }; showSalvageTributeSheet({ x: tx, y: ty }); };
        const text = `Salvage ×${toast.loads}`;
        if (button.textContent !== text) button.textContent = text;
        const className = `salvage-toast${toast.ready ? " is-ready" : ""}`;
        if (button.className !== className) button.className = className;
        const label = `Salvage at ${tx}, ${ty}: ${toast.loads} load${toast.loads === 1 ? "" : "s"}${toast.ready ? ". Ship to the Court" : ""}`;
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (button.style.left !== `${x}px`) button.style.left = `${x}px`;
        if (button.style.top !== `${y}px`) button.style.top = `${y}px`;
      }
      for (const [key, button] of buttons) if (!shown.has(key)) { button.remove(); buttons.delete(key); }
    },
    dispose() { buttons.clear(); layer.remove(); }
  };
}
