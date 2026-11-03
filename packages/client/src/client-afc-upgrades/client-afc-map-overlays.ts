import { AFC_MOMENTUM_ATTACK_PER_STACK, aetherTowerShotsRemaining, afcMomentumStacks } from "@border-empires/shared";
import { ownObservatoryMaxShots } from "../client-observatory-rules/client-observatory-rules.js";
import { createAfcFxLayer, type AfcFxTower } from "./client-afc-fx-layer.js";
import { towerOpenToHijack } from "./client-afc-tower-action.js";
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
  const fx = createAfcFxLayer(canvas, state);
  return { render(tiles, { size, project }) {
    const now = Date.now();
    const towers: AfcFxTower[] = [];
    const canHijack = state.domainIds.includes("afc-oracle-5");
    const maxShots = ownObservatoryMaxShots(state);
    const ready = readyAfcUpgradeCount(state);
    const positions: AfcReadyBadgePosition[] = [];
    const shown = new Set<string>();
    const dormant = new Set(state.dormantStructures.map(item => item.key));
    const bounds = canvas.getBoundingClientRect();
    const scaleX = bounds.width / Math.max(1, canvas.width), scaleY = bounds.height / Math.max(1, canvas.height);
    for (const { wx, wy, wk, vis, t, px, py } of state.authSessionReady && !state.profileSetupRequired ? tiles : []) {
      const stacks = vis === "visible" && t?.muster?.ownerId === state.me ? afcMomentumStacks(t.muster.momentum, Date.now()) : 0;
      const tower = vis === "visible" && t?.observatory?.status === "active" ? t.observatory : undefined;
      const suppressed = (tower?.suppressedUntil ?? 0) > now;
      if (tower) towers.push({ wx, wy, suppressed });
      const owner = t?.ownerId;
      const friendly = Boolean(owner && (state.allies.includes(owner) || state.activeTruces.some(truce => truce.otherPlayerId === owner && truce.endsAt > now)));
      const hijackable = canHijack && tower && owner && owner !== state.me && !friendly && towerOpenToHijack(tower, now);
      const lastShot = tower && t?.ownerId === state.me && !suppressed && aetherTowerShotsRemaining(tower, maxShots, now) === 1;
      const wardUnpowered = t?.ownerId === state.me && dormant.has(`${wk}:fort`);
      const ward = vis === "visible" && t?.fort?.wardEnabled ? wardUnpowered ? "Ward unpowered" : (t.fort.wardRechargesAt ?? 0) > Date.now() ? `Ward ${Math.ceil(((t.fort.wardRechargesAt ?? 0) - Date.now()) / 3_600_000)}h` : t.ownerId === state.me ? "Ward ready" : "Ward charged" : "";
      const label = suppressed ? "Tower suppressed" : hijackable ? "Hijackable" : lastShot ? "Last shot: firing it opens this tower to hijack" : stacks ? `Momentum +${Math.round(stacks * AFC_MOMENTUM_ATTACK_PER_STACK * 100)}%` : ward;
      const showUpgrade = vis === "visible" && shouldShowAfcUpgradeReadyBadge(t, state.me, ready, state.afcJoinDrop);
      if (!label && !showUpgrade) continue;
      const at = isTrue3DRendererActive() ? project(wx, wy) : { sx: px + size / 2, sy: py + size / 2 };
      if (showUpgrade) {
        const lift = isTrue3DRendererActive() ? Math.max(28, size * 1.4) : Math.max(28, size * 0.45 + 8);
        positions.push({ key: wk, x: wx, y: wy, screenX: at.sx, screenY: at.sy - lift });
      }
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
      element.classList.toggle("is-hijackable", Boolean(hijackable));
      element.classList.toggle("is-last-shot", Boolean(lastShot));
      element.setAttribute("aria-label", label);
      element.style.left = `${x}px`; element.style.top = `${y}px`;
    }
    for (const [key, element] of elements) if (!shown.has(key)) { element.remove(); elements.delete(key); }
    // No map behind the season lobby (it passes no tiles): keep takeover beams off that screen.
    fx.render({ size, project }, towers, now, tiles.length === 0);
    badges.render(positions, ready);
  } };
}
