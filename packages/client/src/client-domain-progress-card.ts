import { currentDomainChoiceTier } from "./client-tech-html/client-tech-html.js";
import type { DomainInfo } from "./client-types.js";

export const renderDomainProgressCardHtml = (args: {
  currentTier: number | undefined;
  chosenDomainCount: number;
}): string => {
  const { currentTier, chosenDomainCount } = args;
  const statusLine =
    currentTier !== undefined
      ? `Tier ${currentTier} is open for your next doctrine pick.`
      : "All open domain tiers are currently committed.";
  return `<article class="card domain-progress-card">
    <div class="domain-progress-head">
      <div>
        <div class="domain-summary-kicker">Doctrine</div>
        <strong>Your doctrine path</strong>
      </div>
      <span class="domain-progress-badge">${currentTier !== undefined ? `Tier ${currentTier} live` : `${chosenDomainCount} chosen`}</span>
    </div>
    <p>${statusLine}</p>
  </article>`;
};

export const renderDomainProgressCard = (deps: {
  domainCatalog: DomainInfo[];
  domainChoices: string[];
  domainIds: string[];
}): string =>
  deps.domainCatalog.some(upgrade => upgrade.id.startsWith("afc-")) ? `<article class="card"><strong>AFC specializations</strong><p>Manifest tiers unlock free permanent upgrades. Install one choice per tier at an active owned AFC.</p><p>${deps.domainIds.length} of 5 installed.</p></article>` : renderDomainProgressCardHtml({
    currentTier: currentDomainChoiceTier(deps.domainCatalog, deps.domainChoices),
    chosenDomainCount: deps.domainIds.length
  });
