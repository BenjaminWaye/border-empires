import type { ClientState } from "../client-state/client-state.js";
import type { DomainInfo } from "../client-types.js";
import { formatDomainBenefitSummary, formatDomainCost } from "../client-tech-html/client-tech-html.js";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import "./client-afc-upgrades.css";

type UpgradeState = Pick<ClientState, "me" | "domainCatalog" | "domainIds" | "domainChoices" | "techIds" |
  "domainUiSelectedId" | "domainDetailOpen" | "gold" | "strategicResources" | "pendingDomainUnlockId" | "chosenTrickleResource" | "techCatalog" | "joinSeasonId">;
interface UpgradeView { tier: number; selectedId: string; expanded: boolean; identity: string; html?: string }
const views = new WeakMap<HTMLElement, UpgradeView>();
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const roman = (tier: number): string => ["I", "II", "III", "IV", "V"][tier - 1] ?? String(tier);

function currentTier(state: UpgradeState): number {
  const open = state.domainCatalog.filter(upgrade => state.domainChoices.includes(upgrade.id));
  const candidates = open.length ? open : state.domainCatalog;
  return candidates.length ? Math.min(...candidates.map(upgrade => upgrade.tier)) : 1;
}

const upgradeTiers = (state: UpgradeState): number[] =>
  [...new Set(state.domainCatalog.map(upgrade => upgrade.tier))].sort((a, b) => a - b);

function canInstall(state: UpgradeState, upgrade: DomainInfo): boolean {
  return readyAfcUpgradeCount({ ...state, domainChoices: [upgrade.id] }) > 0 &&
    state.domainChoices.includes(upgrade.id);
}

function detail(state: UpgradeState, upgrade: DomainInfo, id: string): string {
  const owned = state.domainIds.includes(upgrade.id);
  const pending = state.pendingDomainUnlockId === upgrade.id;
  const sameTier = state.domainCatalog.find(candidate => candidate.tier === upgrade.tier && state.domainIds.includes(candidate.id));
  const available = canInstall(state, upgrade);
  const reason = sameTier ? `Upgrade ${roman(upgrade.tier)} is installed: ${sameTier.name}.`
    : !state.domainChoices.includes(upgrade.id) ? "Complete earlier upgrade tiers to reach this choice."
    : upgrade.requiresTechId && !state.techIds.includes(upgrade.requiresTechId)
      ? `Requires ${state.techCatalog.find(tech => tech.id === upgrade.requiresTechId)?.name ?? upgrade.requiresTechId}.`
      : state.pendingDomainUnlockId ? "Waiting for server confirmation of the current installation."
      : !available && !pending ? "The listed resources are not yet available." : "";
  const resourceChoice = owned && typeof upgrade.effects?.chosenResourceSlotGrant === "number" && state.chosenTrickleResource
    ? `<p>Installed allocation: ${escape(state.chosenTrickleResource)}.</p>` : "";
  return `<section class="afc-upgrade-detail" id="${escape(id)}">
    <h3>${escape(upgrade.name)}</h3>
    <p class="afc-upgrade-benefit">${escape(formatDomainBenefitSummary(upgrade))}</p>
    <p>${escape(upgrade.description)}</p>${resourceChoice}
    <p class="afc-upgrade-price">${escape(formatDomainCost(upgrade))}</p>
    ${reason ? `<p class="afc-upgrade-reason">${escape(reason)}</p>` : ""}
    <button type="button" class="panel-btn afc-upgrade-install" data-domain-unlock="${escape(upgrade.id)}"
      ${!available || state.pendingDomainUnlockId ? "disabled" : ""}>${owned ? "Installed" : pending ? "Installing…" : "Install upgrade"}</button>
    <p class="afc-upgrade-consequence">One choice per tier. Installing closes the other choices at this tier for this campaign.</p>
  </section>`;
}

export function renderAfcUpgradesHtml(state: UpgradeState, view: UpgradeView, prefix: string): string {
  const tiers = upgradeTiers(state);
  const count = readyAfcUpgradeCount(state);
  const chosen = state.domainCatalog.filter(upgrade => state.domainIds.includes(upgrade.id));
  const options = state.domainCatalog.filter(upgrade => upgrade.tier === view.tier);
  const tierOwned = chosen.find(upgrade => upgrade.tier === view.tier);
  const tierIndex = tiers.indexOf(view.tier);
  const tierOpen = options.some(upgrade => state.domainChoices.includes(upgrade.id));
  return `<section class="afc-upgrades" aria-label="AFC upgrades">
    <div class="afc-upgrade-summary"><p><strong>${chosen.length} of ${tiers.length}</strong> installed</p>
      <span class="afc-upgrade-ready-count" role="status">${count ? `${count} ready` : "None ready"}</span></div>
    ${tiers.length ? `<div class="afc-upgrade-tier-browser" role="group" aria-label="Browse upgrade tiers">
      <button type="button" class="afc-upgrade-tier-step" data-afc-upgrade-step="previous" aria-label="Previous upgrade tier" ${tierIndex <= 0 ? "disabled" : ""}><span aria-hidden="true">‹</span></button>
      <div class="afc-upgrade-tier-current" aria-live="polite" aria-atomic="true">
        <h3 tabindex="-1" data-afc-upgrade-current-tier="${view.tier}">Upgrade ${roman(view.tier)}<span>${tierIndex + 1} / ${tiers.length}</span></h3>
        <p>${tierOwned ? `Installed · ${escape(tierOwned.name)}` : tierOpen ? "Choose one upgrade" : "Locked · complete earlier tiers"}</p>
      </div>
      <button type="button" class="afc-upgrade-tier-step" data-afc-upgrade-step="next" aria-label="Next upgrade tier" ${tierIndex >= tiers.length - 1 ? "disabled" : ""}><span aria-hidden="true">›</span></button>
    </div>` : ""}
    <div class="afc-upgrade-options">${options.map(upgrade => {
      const expanded = view.expanded && view.selectedId === upgrade.id;
      const owned = state.domainIds.includes(upgrade.id);
      const detailId = `${prefix}-${upgrade.id}`;
      return `<div class="afc-upgrade-option ${expanded ? "is-expanded" : ""}">
        <button type="button" class="afc-upgrade-card" data-afc-upgrade-card="${escape(upgrade.id)}"
          aria-expanded="${expanded}" aria-controls="${escape(detailId)}">
          <span class="afc-upgrade-card-top"><strong>${escape(upgrade.name)}</strong><span>${owned ? "✓ Installed" : expanded ? "−" : "+"}</span></span>
          <span>${escape(formatDomainBenefitSummary(upgrade))}</span>
        </button>${expanded ? detail(state, upgrade, detailId) : ""}
      </div>`;
    }).join("") || "<p>No upgrades are available in this catalogue.</p>"}</div>
  </section>`;
}

/** Single-level inline details on desktop and mobile; no tab-within-tab or modal. */
export function renderAfcUpgradePanels(
  state: UpgradeState, desktop: HTMLElement, mobile: HTMLElement, install: (id: string) => void
): void {
  state.domainDetailOpen = false;
  for (const [index, root] of [desktop, mobile].entries()) {
    const identity = `${state.me}/${state.joinSeasonId}`;
    const remembered = views.get(root);
    const view = remembered?.identity === identity && state.domainCatalog.some(upgrade => upgrade.tier === remembered.tier)
      ? remembered : { tier: currentTier(state), selectedId: "", expanded: false, identity };
    // HUD renders before INIT. Do not remember an empty catalogue's provisional tier.
    if (state.domainCatalog.length) views.set(root, view);
    else views.delete(root);
    const repaint = (): void => {
      const html = renderAfcUpgradesHtml(state, view, `afc-upgrade-${index}`);
      // Routine HUD ticks must not interrupt touch scrolling or keyboard focus.
      if (view.html === html && root.firstElementChild) return;
      const scrollTop = root.scrollTop;
      const focused = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      const focusSelector = focused?.dataset.afcUpgradeStep ? `[data-afc-upgrade-step="${focused.dataset.afcUpgradeStep}"]`
        : focused?.hasAttribute("data-afc-upgrade-current-tier") ? "[data-afc-upgrade-current-tier]"
        : focused?.dataset.domainUnlock ? `[data-domain-unlock="${CSS.escape(focused.dataset.domainUnlock)}"]`
        : focused?.dataset.afcUpgradeCard ? `[data-afc-upgrade-card="${CSS.escape(focused.dataset.afcUpgradeCard)}"]` : "";
      root.innerHTML = html;
      view.html = html;
      root.scrollTop = scrollTop;
      if (focusSelector) root.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
    };
    repaint();
    root.onclick = event => {
      const target = event.target as HTMLElement;
      const step = target.closest<HTMLButtonElement>("[data-afc-upgrade-step]");
      if (step) {
        if (step.disabled) return;
        const tiers = upgradeTiers(state);
        const nextIndex = tiers.indexOf(view.tier) + (step.dataset.afcUpgradeStep === "next" ? 1 : -1);
        const nextTier = tiers[nextIndex];
        if (nextTier === undefined) return;
        view.tier = nextTier; view.expanded = false;
        repaint();
        const nextStep = root.querySelector<HTMLButtonElement>(`[data-afc-upgrade-step="${step.dataset.afcUpgradeStep}"]`);
        const focusTarget = nextStep?.disabled ? root.querySelector<HTMLElement>("[data-afc-upgrade-current-tier]") : nextStep;
        focusTarget?.focus({ preventScroll: true });
        return;
      }
      const button = target.closest<HTMLButtonElement>("[data-afc-upgrade-card]");
      if (button?.dataset.afcUpgradeCard) {
        const id = button.dataset.afcUpgradeCard;
        view.expanded = view.selectedId !== id || !view.expanded;
        view.selectedId = id; state.domainUiSelectedId = id;
        repaint(); root.querySelector<HTMLButtonElement>(`[data-afc-upgrade-card="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
        return;
      }
      const action = target.closest<HTMLButtonElement>("[data-domain-unlock]");
      if (action?.dataset.domainUnlock && !action.disabled) install(action.dataset.domainUnlock);
    };
    root.onkeydown = event => {
      if (event.key !== "Escape" || !view.expanded) return;
      event.stopPropagation(); event.preventDefault();
      view.expanded = false;
      repaint();
      root.querySelector<HTMLButtonElement>(`[data-afc-upgrade-card="${CSS.escape(view.selectedId)}"]`)?.focus({ preventScroll: true });
    };
  }
}
