import {
  currentDomainChoiceTier,
  ownedDomainByTier,
  renderDomainChoiceGridHtml,
  renderDomainDetailCardHtml
} from "../client-tech-html/client-tech-html.js";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "../client-tech-tree-html/client-tech-tree-html.js";
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { DomainInfo, TechInfo } from "../client-types.js";

export const formatTechCost = (tech: TechInfo): string => {
  const checklist = tech.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /coin|gold|food|titanium|crystal|umbrite|shard/i.test(item.label)).map((item) => item.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallbackCostBits: string[] = [];
  if ((tech.requirements.gold ?? 0) > 0) {
    fallbackCostBits.push(`${tech.requirements.gold.toLocaleString()} coin`);
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = tech.requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) fallbackCostBits.push(`${amount.toLocaleString()} ${resourceKey.toLowerCase()}`);
  }
  if (fallbackCostBits.length > 0) return fallbackCostBits.join(" · ");
  const fallback = checklist.map((item) => item.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

export { relatedStructureTypesForTech } from "./client-tech-structure-unlocks.js";

export const renderTechChoiceGrid = (deps: {
  state: {
    techTreeExpanded: boolean;
    techCatalog: TechInfo[];
    techUiSelectedId: string;
    techRootId: string | undefined;
    currentResearch: { techId?: string; completesAt?: number } | null | undefined;
    techTreeZoom: number; techAffordablePulseUntilByTechId: ReadonlyMap<string, number>;
  };
  isGoodPick?: (tech: TechInfo) => boolean;
  effectiveOwnedTechIds: () => string[];
  effectiveTechChoices: () => string[];
  orderedTechIdsByTier: (catalog: TechInfo[]) => string[];
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds">) => string[];
  techNameList: (ids: string[]) => string;
  isPendingTechUnlock: (techId: string) => boolean;
  formatCooldownShort: (ms: number) => string;
  titleCaseFromId: (id: string) => string;
  viewportHeight: number;
  isMobile: boolean;
}): string =>
  deps.state.techTreeExpanded
    ? renderExpandedTechChoiceTreeHtml({
        ...(deps.isGoodPick ? { isGoodPick: deps.isGoodPick } : {}),
        techCatalog: deps.state.techCatalog,
        techUiSelectedId: deps.state.techUiSelectedId,
        techRootId: deps.state.techRootId,
        currentResearch: deps.state.currentResearch,
        effectiveOwnedTechIds: deps.effectiveOwnedTechIds(),
        effectiveTechChoices: deps.effectiveTechChoices(),
        orderedTechIdsByTier: deps.orderedTechIdsByTier,
        techTier: deps.techTier,
        techPrereqIds: deps.techPrereqIds,
        techNameList: deps.techNameList,
        formatTechCost,
        isPendingTechUnlock: deps.isPendingTechUnlock,
        formatCooldownShort: deps.formatCooldownShort,
        titleCaseFromId: deps.titleCaseFromId,
        viewportHeight: deps.viewportHeight,
        isMobile: deps.isMobile,
        techTreeZoom: deps.state.techTreeZoom, pulseUntilByTechId: deps.state.techAffordablePulseUntilByTechId
      })
    : renderCompactTechChoiceGridHtml({
        ...(deps.isGoodPick ? { isGoodPick: deps.isGoodPick } : {}),
        techCatalog: deps.state.techCatalog,
        techUiSelectedId: deps.state.techUiSelectedId,
        techRootId: deps.state.techRootId,
        currentResearch: deps.state.currentResearch,
        effectiveOwnedTechIds: deps.effectiveOwnedTechIds(),
        effectiveTechChoices: deps.effectiveTechChoices(),
        orderedTechIdsByTier: deps.orderedTechIdsByTier,
        techTier: deps.techTier,
        techPrereqIds: deps.techPrereqIds,
        techNameList: deps.techNameList,
        formatTechCost,
        isPendingTechUnlock: deps.isPendingTechUnlock,
        formatCooldownShort: deps.formatCooldownShort,
        titleCaseFromId: deps.titleCaseFromId,
        viewportHeight: deps.viewportHeight,
        isMobile: deps.isMobile,
        techTreeZoom: deps.state.techTreeZoom, pulseUntilByTechId: deps.state.techAffordablePulseUntilByTechId
      });

export const selectedTechInfo = (deps: {
  techUiSelectedId: string;
  desktopPickValue: string;
  mobilePickValue: string;
  techCatalog: TechInfo[];
}): TechInfo | undefined => {
  const selectedId = deps.techUiSelectedId || deps.desktopPickValue || deps.mobilePickValue || deps.techCatalog[0]?.id;
  return deps.techCatalog.find((tech) => tech.id === selectedId);
};

export const renderTechDetailPrompt = (): string => "";

export const renderDomainChoiceGrid = (deps: {
  domainCatalog: DomainInfo[];
  domainIds: string[];
  domainUiSelectedId: string;
  domainChoices: string[];
  techNameList: (ids: string[]) => string;
}): string =>
  renderDomainChoiceGridHtml({
    domainCatalog: deps.domainCatalog,
    domainIds: deps.domainIds,
    domainUiSelectedId: deps.domainUiSelectedId,
    ownedByTier: ownedDomainByTier(deps.domainCatalog, deps.domainIds),
    currentTier: currentDomainChoiceTier(deps.domainCatalog, deps.domainChoices),
    requiresTechNames: Object.fromEntries(deps.domainCatalog.map((domain) => [domain.id, deps.techNameList([domain.requiresTechId])]))
  });

export const renderDomainDetailCard = (deps: {
  domainCatalog: DomainInfo[];
  domainUiSelectedId: string;
  domainIds: string[];
  domainChoices: string[];
  pendingDomainUnlockId: string;
  chosenTrickleResource?: ChosenTrickleResource;
  techNameList: (ids: string[]) => string;
}): string => {
  const domain = deps.domainCatalog.find((item) => item.id === deps.domainUiSelectedId);
  const chosenByTier = ownedDomainByTier(deps.domainCatalog, deps.domainIds);
  const currentTier = currentDomainChoiceTier(deps.domainCatalog, deps.domainChoices);
  return renderDomainDetailCardHtml({
    domain,
    domainIds: deps.domainIds,
    chosenInTier: domain ? chosenByTier.get(domain.tier) : undefined,
    currentTier,
    requiresTechName: domain ? deps.techNameList([domain.requiresTechId]) : "",
    pendingDomainUnlockId: deps.pendingDomainUnlockId,
    ...(deps.chosenTrickleResource ? { chosenTrickleResource: deps.chosenTrickleResource } : {})
  });
};

export const renderDomainDetailOverlay = (deps: {
  domainCatalog: DomainInfo[];
  domainUiSelectedId: string;
  domainIds: string[];
  domainChoices: string[];
  pendingDomainUnlockId: string;
  chosenTrickleResource?: ChosenTrickleResource;
  techNameList: (ids: string[]) => string;
}): string => {
  const domain = deps.domainCatalog.find((item) => item.id === deps.domainUiSelectedId);
  if (!domain) return "";
  return `<div class="tech-detail-backdrop" data-domain-detail-close="backdrop"></div>
    <div class="tech-detail-modal">
      <button class="tech-detail-close" type="button" aria-label="Close domain details" data-domain-detail-close="button">×</button>
      <div class="tech-detail-scroll">
        ${renderDomainDetailCard({
          domainCatalog: deps.domainCatalog,
          domainUiSelectedId: deps.domainUiSelectedId,
          domainIds: deps.domainIds,
          domainChoices: deps.domainChoices,
          pendingDomainUnlockId: deps.pendingDomainUnlockId,
          ...(deps.chosenTrickleResource ? { chosenTrickleResource: deps.chosenTrickleResource } : {}),
          techNameList: deps.techNameList
        })}
      </div>
    </div>`;
};
