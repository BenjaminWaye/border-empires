import { afcMomentumStacks } from "@border-empires/shared";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { createAfcUpgradeReadyBadges, readyAfcUpgradeCount, shouldShowAfcUpgradeReadyBadge, type AfcReadyBadgePosition } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import "./client-afc-map-overlays.css";

interface MapTile { wx: number; wy: number; wk: string; px: number; py: number; vis: string; t?: Tile | undefined }
interface Projection { size: number; project: (x: number, y: number) => { sx: number; sy: number } }
/** Shared screen-space overlay follows either renderer's real projection, including wrapped copies. */
export function createAfcMapOverlays(canvas: HTMLCanvasElement, state: ClientState, open: () => void): {
  render: (tiles: readonly MapTile[], projection: Projection) => void;
} {
  const badges = createAfcUpgradeReadyBadges(canvas, open);
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "afc-signal-layer";
  layer.setAttribute("aria-label", "AFC tactical signals");
  canvas.parentElement?.append(layer);
  const elements = new Map<string, HTMLElement>();
  return { render(tiles, { size, project }) {
    const ready = readyAfcUpgradeCount(state);
    const positions: AfcReadyBadgePosition[] = [];
    const detections = new Map(state.afcDetectedFlags.map(flag => [`${flag.x},${flag.y}`, flag]));
    const shown = new Set<string>();
    const bounds = canvas.getBoundingClientRect();
    const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
    for (const { wx, wy, wk, vis, t, px, py } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
      const at = isTrue3DRendererActive() ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
      if (vis === "visible" && shouldShowAfcUpgradeReadyBadge(t, state.me, ready, state.afcJoinDrop)) {
        const lift = isTrue3DRendererActive() ? Math.max(28, size * 1.4) : Math.max(28, size * 0.45 + 8);
        positions.push({ key: wk, x: wx, y: wy, screenX: at.sx, screenY: at.sy - lift });
      }
      const flag = detections.get(wk);
      const stacks = vis === "visible" && t?.muster?.ownerId === state.me ? afcMomentumStacks(t.muster.momentum, Date.now()) : 0;
      const suppressed = vis === "visible" && (t?.observatory?.suppressedUntil ?? 0) > Date.now();
      const ward = vis === "visible" && t?.fort?.wardEnabled ? (t.fort.wardRechargesAt ?? 0) > Date.now() ? `Ward ${Math.ceil(((t.fort.wardRechargesAt ?? 0) - Date.now()) / 3_600_000)}h` : "Ward ready" : "";
      const label = flag ? `⚑ ${wx}, ${wy}` : suppressed ? "Tower suppressed" : stacks ? `Momentum +${stacks * 5}%` : ward;
      const x = at.sx * scaleX, y = at.sy * scaleY;
      if (!label || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height || shown.size >= 1024) continue;
      shown.add(wk);
      let element = elements.get(wk);
      if (!element) {
        element = canvas.ownerDocument.createElement("button");
        element.className = "afc-map-signal";
        element.onpointerdown = event => event.stopPropagation();
        element.onclick = event => { event.stopPropagation(); state.selected = { x: wx, y: wy }; open(); };
        layer.append(element); elements.set(wk, element);
      }
      element.textContent = label;
      element.setAttribute("aria-label", flag ? `Detected enemy muster flag at ${wx}, ${wy}. Open tower actions.` : label);
      element.style.left = `${x}px`; element.style.top = `${y}px`;
    }
    for (const [key, element] of elements) if (!shown.has(key)) { element.remove(); elements.delete(key); }
    badges.render(positions, ready);
  } };
}
