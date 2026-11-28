import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { activateWaystationSite, waystationActivationReason } from "./client-waystation-site.js";
import "./client-waystation-ready-toasts.css";

interface MapTile { readonly wx: number; readonly wy: number; readonly wk: string; readonly px: number; readonly py: number; readonly vis: string; readonly t?: Tile | undefined }
interface Projection { readonly size: number; readonly project: (x: number, y: number) => { sx: number; sy: number } }
type State = Pick<ClientState, "me" | "authSessionReady" | "profileSetupRequired">;
const MAX_TOASTS = 64;

/** Persistent screen-space cards anchored above visible, unactivated rigs on tiles the player owns, in either renderer. */
export function createWaystationReadyToasts(canvas: HTMLCanvasElement, state: State, activate = activateWaystationSite): {
  render: (tiles: readonly MapTile[], projection: Projection) => void;
  /** Tiles ("x,y") showing an Activate card after the last render: the map's "!" pins step off them. */
  cardTiles: () => ReadonlySet<string>;
  dispose: () => void;
} {
  const doc = canvas.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "waystation-toast-layer";
  layer.setAttribute("aria-label", "Waystations available");
  canvas.parentElement?.append(layer);
  const cards = new Map<string, { card: HTMLDivElement; note: HTMLSpanElement; button: HTMLButtonElement }>();
  let cardTiles = new Set<string>();
  return {
    render(tiles, { size, project }) {
      const shown = new Set<string>();
      const tilesWithCards = new Set<string>();
      const bounds = canvas.getBoundingClientRect();
      const sx = bounds.width / Math.max(1, canvas.width), sy = bounds.height / Math.max(1, canvas.height);
      const three = isTrue3DRendererActive();
      let omitted = 0;
      for (const { wx, wy, wk, px, py, vis, t } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
        if (vis !== "visible" || !t?.waystation || t.waystation.activated || t.fogged) continue;
        // Unclaimed or rival-held rigs get no card; claiming the tile is what earns the prompt.
        if (!state.me || t.ownerId !== state.me) continue;
        const at = three ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
        const lift = three ? Math.max(24, size * 1.4) : Math.max(20, size * 0.48);
        const x = at.sx * sx, y = (at.sy - lift) * sy;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) continue;
        if (shown.size >= MAX_TOASTS) { omitted += 1; continue; }
        shown.add(wk);
        tilesWithCards.add(`${t.x},${t.y}`);
        let nodes = cards.get(wk);
        if (!nodes) {
          const card = doc.createElement("div");
          card.className = "waystation-toast";
          const title = doc.createElement("strong");
          title.textContent = "Waystation";
          const note = doc.createElement("span");
          note.className = "waystation-toast-note";
          const button = doc.createElement("button");
          button.type = "button";
          button.textContent = "Activate";
          card.onpointerdown = event => event.stopPropagation();
          card.onclick = event => event.stopPropagation();
          card.append(title, note, button);
          layer.append(card);
          nodes = { card, note, button };
          cards.set(wk, nodes);
        }
        const { card, note, button } = nodes;
        const reason = waystationActivationReason(state.me, t);
        const text = reason || "Reward available";
        if (note.textContent !== text) note.textContent = text;
        button.disabled = Boolean(reason);
        button.setAttribute("aria-label", `Activate waystation at ${t.x}, ${t.y}`);
        button.title = reason || "Collect one random reward";
        button.onclick = event => { event.stopPropagation(); activate(t); };
        const left = `${Math.max(88, Math.min(bounds.width - 88, x))}px`;
        const top = `${Math.max(108, y)}px`;
        if (card.style.left !== left) card.style.left = left;
        if (card.style.top !== top) card.style.top = top;
      }
      for (const [key, nodes] of cards) if (!shown.has(key)) { nodes.card.remove(); cards.delete(key); }
      cardTiles = tilesWithCards;
      // A bounded DOM store with frame-local telemetry, including dense-map omissions.
      layer.dataset.count = String(cards.size);
      layer.dataset.omitted = String(omitted);
    },
    cardTiles: () => cardTiles,
    dispose() { cards.clear(); cardTiles = new Set(); layer.remove(); }
  };
}
