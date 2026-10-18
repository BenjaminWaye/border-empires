import type { ClientState } from "../client-state/client-state.js";
import type { DomainInfo } from "../client-types.js";
import { formatDomainBenefitSummary, formatDomainCost } from "../client-tech-html/client-tech-html.js";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import "./client-afc-upgrades.css";

type UpgradeState = Pick<ClientState, "me" | "domainCatalog" | "domainIds" | "domainChoices" | "techIds" |
  "domainUiSelectedId" | "domainDetailOpen" | "gold" | "strategicResources" | "pendingDomainUnlockId" | "chosenTrickleResource" | "techCatalog" | "joinSeasonId">;
interface UpgradeView { selectedId: string; expanded: boolean; identity: string; html?: string }
const views = new WeakMap<HTMLElement, UpgradeView>();
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const roman = (tier: number): string => ["I", "II", "III", "IV", "V"][tier - 1] ?? String(tier);

function currentTier(state: UpgradeState): number | undefined {
  const chosenTiers = new Set(state.domainCatalog.filter(upgrade => state.domainIds.includes(upgrade.id)).map(upgrade => upgrade.tier));
  const remaining = state.domainCatalog.filter(upgrade => !chosenTiers.has(upgrade.tier));
  const open = remaining.filter(upgrade => state.domainChoices.includes(upgrade.id));
  const candidates = open.length ? open : remaining;
  return candidates.length ? Math.min(...candidates.map(upgrade => upgrade.tier)) : undefined;
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
  const chosen = state.domainCatalog.filter(upgrade => state.domainIds.includes(upgrade.id)).sort((a, b) => a.tier - b.tier);
  const tier = currentTier(state);
  const options = state.domainCatalog.filter(upgrade => upgrade.tier === tier && state.domainChoices.includes(upgrade.id));
  const heading = tier === undefined ? (tiers.length ? "Campaign configuration complete" : "Loading upgrade choices")
    : options.length ? `Upgrade ${roman(tier)} · Choose one` : `Next: Upgrade ${roman(tier)}`;
  return `<section class="afc-upgrades" aria-label="AFC upgrades">
    <div class="afc-upgrade-summary"><p><strong>${chosen.length} of ${tiers.length}</strong> installed</p>
      <span class="afc-upgrade-ready-count" role="status">${count ? `${count} ready` : "None ready"}</span></div>
    ${chosen.length ? `<section class="afc-upgrade-history" aria-label="Installed upgrades"><h3>Installed upgrades</h3>
      <ol>${chosen.map(upgrade => `<li data-afc-upgrade-installed="${escape(upgrade.id)}"><span class="afc-upgrade-history-tier">Tier ${roman(upgrade.tier)}</span>
        <div><strong>${escape(upgrade.name)}</strong><p>${escape(formatDomainBenefitSummary(upgrade))}${typeof upgrade.effects?.chosenResourceSlotGrant === "number" && state.chosenTrickleResource ? ` · ${escape(state.chosenTrickleResource)}` : ""}</p></div></li>`).join("")}</ol>
    </section>` : ""}
    <div class="afc-upgrade-current" aria-live="polite" aria-atomic="true">
      <h3 tabindex="-1" ${tier !== undefined ? `data-afc-upgrade-current-tier="${tier}"` : "data-afc-upgrade-complete"}>${heading}</h3>
      ${!options.length && tier !== undefined ? "<p>Continue progressing your Manifest to unlock your next upgrade choice.</p>" : ""}
    </div>
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
    }).join("")}</div>
  </section>`;
}

/** Single-level inline details on desktop and mobile; no tab-within-tab or modal. */
export function renderAfcUpgradePanels(
  state: UpgradeState, desktop: HTMLElement, mobile: HTMLElement, install: (id: string) => void
): void {
  state.domainDetailOpen = false;
  for (const [index, root] of [desktop, mobile].entries()) {
    const identity = `${state.me}/${state.joinSeasonId}/${currentTier(state) ?? "complete"}`;
    const remembered = views.get(root);
    const view = remembered?.identity === identity
      ? remembered : { selectedId: "", expanded: false, identity };
    // HUD renders before INIT. Do not remember an empty catalogue's provisional tier.
    if (state.domainCatalog.length) views.set(root, view);
    else views.delete(root);
    const repaint = (): void => {
      const html = renderAfcUpgradesHtml(state, view, `afc-upgrade-${index}`);
      // Routine HUD ticks must not interrupt touch scrolling or keyboard focus.
      if (view.html === html && root.firstElementChild) return;
      const scrollTop = root.scrollTop;
      const focused = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      const focusSelector = focused?.hasAttribute("data-afc-upgrade-current-tier") ? "[data-afc-upgrade-current-tier]"
        : focused?.dataset.domainUnlock ? `[data-domain-unlock="${CSS.escape(focused.dataset.domainUnlock)}"]`
        : focused?.dataset.afcUpgradeCard ? `[data-afc-upgrade-card="${CSS.escape(focused.dataset.afcUpgradeCard)}"]` : "";
      root.innerHTML = html;
      view.html = html;
      root.scrollTop = scrollTop;
      if (focusSelector) {
        const control = root.querySelector<HTMLElement>(focusSelector);
        if (control) control.focus({ preventScroll: true });
        else root.querySelector<HTMLElement>(".afc-upgrade-current h3")?.focus();
      }
    };
    repaint();
    root.onclick = event => {
      const target = event.target as HTMLElement;
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
