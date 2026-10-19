import { afcSpecializationProgress, usesAfcSpecializations, type AfcTechTier } from "@border-empires/shared";
import type { DomainInfo, Tile } from "../client-types.js";
import { isAfcHiddenForJoinDrop, type AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import "./client-afc-upgrade-ready.css";

type Resource = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
export interface AfcUpgradeReadiness {
  readonly afcUpgradeRuleset?: "afc-v1" | undefined;
  readonly afcUpgradeInstallAllowed?: boolean | undefined;
  readonly techCatalog?: readonly AfcTechTier[];
  readonly me: string;
  readonly domainCatalog: readonly DomainInfo[];
  readonly domainChoices: readonly string[];
  readonly domainIds: readonly string[];
  readonly techIds: readonly string[];
  readonly gold: number;
  readonly strategicResources: Partial<Record<Resource, number>>;
  readonly pendingDomainUnlockId: string;
}

/** Read live balances rather than a stale affordability stamp from the last INIT. */
export function readyAfcUpgradeCount(state: AfcUpgradeReadiness): number {
  if (!state.me || state.pendingDomainUnlockId) return 0;
  const progression = { techIds: state.techIds, domainIds: state.domainIds, ...(state.afcUpgradeRuleset ? { afcUpgradeRuleset: state.afcUpgradeRuleset } : {}) };
  if (usesAfcSpecializations(progression)) {
    if (state.afcUpgradeInstallAllowed === false) return 0;
    const progress = afcSpecializationProgress(progression, state.techCatalog ?? []);
    if (!progress.choices.some(id => state.domainChoices.includes(id))) return 0;
    const chosen = new Set(state.domainCatalog.filter(upgrade => state.domainIds.includes(upgrade.id)).map(upgrade => upgrade.tier));
    return Array.from({ length: progress.unlockedTier }, (_, i) => i + 1).filter(tier => !chosen.has(tier)).length;
  }
  const ready = new Set<number>();
  const chosenTiers = new Set(state.domainCatalog.filter(upgrade => state.domainIds.includes(upgrade.id)).map(upgrade => upgrade.tier));
  for (const upgrade of state.domainCatalog) {
    if (chosenTiers.has(upgrade.tier) || !state.domainChoices.includes(upgrade.id)) continue;
    if (upgrade.requiresTechId && !state.techIds.includes(upgrade.requiresTechId)) continue;
    if (state.gold < upgrade.requirements.gold) continue;
    if (Object.entries(upgrade.requirements.resources).some(([key, amount]) =>
      (state.strategicResources[key as Resource] ?? 0) < (amount ?? 0))) continue;
    ready.add(upgrade.tier);
  }
  return ready.size;
}

export function shouldShowAfcUpgradeReadyBadge(
  tile: Pick<Tile, "x" | "y" | "terrain" | "ownerId" | "afc"> | undefined,
  me: string,
  ready: number,
  drop: AfcJoinDropState
): boolean {
  return Boolean(ready > 0 && me && tile?.terrain === "LAND" && tile.ownerId === me &&
    tile.afc?.ownerId === me && tile.afc.status === "active" && !isAfcHiddenForJoinDrop(drop, tile.x, tile.y));
}

export interface AfcReadyBadgePosition {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly screenX: number;
  readonly screenY: number;
}

const MAX_BADGES = 256;

/** Screen-space buttons share the actual projection of either map renderer. */
export function createAfcUpgradeReadyBadges(canvas: HTMLCanvasElement, openUpgrades: () => void): {
  render: (positions: readonly AfcReadyBadgePosition[], ready: number) => void;
  dispose: () => void;
} {
  const layer = canvas.ownerDocument.createElement("div");
  layer.className = "afc-upgrade-ready-layer";
  layer.setAttribute("aria-label", "AFC upgrades available");
  canvas.parentElement?.append(layer);
  const buttons = new Map<string, HTMLButtonElement>();
  const openFromOverview = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest("[data-open-afc-upgrades]")) openUpgrades();
  };
  canvas.ownerDocument.addEventListener("click", openFromOverview);
  return {
    render(positions, ready) {
      for (const nav of Array.from(canvas.ownerDocument.querySelectorAll<HTMLElement>('[data-panel="domains"], [data-mobile-panel="domains"]'))) {
        const value = ready > 0 ? String(ready) : "";
        if ((nav.dataset.afcUpgradeReady ?? "") === value) continue;
        if (value) {
          nav.dataset.afcUpgradeReady = value;
          nav.setAttribute("aria-description", `${ready} AFC upgrade${ready === 1 ? "" : "s"} ready`);
        } else {
          delete nav.dataset.afcUpgradeReady;
          nav.removeAttribute("aria-description");
        }
      }
      const shown = new Set<string>();
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / Math.max(1, canvas.width);
      const scaleY = bounds.height / Math.max(1, canvas.height);
      for (const position of ready > 0 ? positions.slice(0, MAX_BADGES) : []) {
        if (!Number.isFinite(position.screenX) || !Number.isFinite(position.screenY)) continue;
        const x = position.screenX * scaleX;
        const y = position.screenY * scaleY;
        if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) continue;
        shown.add(position.key);
        let button = buttons.get(position.key);
        if (!button) {
          button = canvas.ownerDocument.createElement("button");
          button.type = "button";
          button.className = "afc-upgrade-ready-badge";
          button.onpointerdown = event => event.stopPropagation();
          button.onclick = event => { event.stopPropagation(); openUpgrades(); };
          layer.append(button);
          buttons.set(position.key, button);
        }
        const label = `${ready} upgrade${ready === 1 ? "" : "s"} ready`;
        if (button.textContent !== `↑ ${label}`) button.textContent = `↑ ${label}`;
        const accessibleLabel = `AFC at ${position.x}, ${position.y}: ${label}. Open AFC Upgrades`;
        if (button.getAttribute("aria-label") !== accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
        if (button.style.left !== `${x}px`) button.style.left = `${x}px`;
        if (button.style.top !== `${y}px`) button.style.top = `${y}px`;
      }
      for (const [key, button] of buttons) {
        if (!shown.has(key)) { button.remove(); buttons.delete(key); }
      }
    },
    dispose() { canvas.ownerDocument.removeEventListener("click", openFromOverview); buttons.clear(); layer.remove(); }
  };
}
