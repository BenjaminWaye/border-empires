import {
  crystalAbilityInfoButtonHtml,
  relatedCrystalAbilitiesForTech,
} from "../client-crystal-ability-info/client-crystal-ability-info.js";
import { renderTechHighlightTagsHtml } from "../client-tech-payoffs.js";
import { techBlockedReasonSummary, techMissingResourceSummary } from "../client-tech-requirements/client-tech-requirements.js";
import {
  currentDomainChoiceTier,
  ownedDomainByTier,
  renderDomainChoiceGridHtml,
  renderDomainDetailCardHtml,
  renderTechDetailCardHtml
} from "../client-tech-html/client-tech-html.js";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "../client-tech-tree-html/client-tech-tree-html.js";
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { DomainInfo, TechInfo } from "../client-types.js";
import type { StructureInfoKey } from "../client-map-display.js";
import { renderResourceRevealHtml } from "../client-resource-discovery-info.js";

export const formatTechCost = (tech: TechInfo): string => {
  const checklist = tech.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /gold|food|titanium|crystal|umbrite|shard/i.test(item.label)).map((item) => item.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallbackCostBits: string[] = [];
  if ((tech.requirements.gold ?? 0) > 0) {
    fallbackCostBits.push(`${tech.requirements.gold.toLocaleString()} gold`);
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = tech.requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) fallbackCostBits.push(`${amount.toLocaleString()} ${resourceKey.toLowerCase()}`);
  }
  if (fallbackCostBits.length > 0) return fallbackCostBits.join(" · ");
  const fallback = checklist.map((item) => item.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

export const relatedStructureTypesForTech = (tech: TechInfo): StructureInfoKey[] => {
  const out = new Set<StructureInfoKey>();
  const effects = tech.effects ?? {};
  for (const [key] of Object.entries(effects)) {
    switch (key) {
      case "unlockForts":
        out.add("FORT");
        break;
      case "unlockTitaniumBastion":
        out.add("TITANIUM_BASTION");
        break;
      case "unlockThunderBastion":
        out.add("THUNDER_BASTION");
        break;
      case "unlockObservatory":
        out.add("OBSERVATORY");
        break;
      case "unlockFarmstead":
        out.add("FARMSTEAD");
        break;
      case "unlockWaterworksUpgrade":
        out.add("WATERWORKS");
        break;
      case "unlockCamp":
        out.add("UMBRITE_RIG");
        break;
      case "unlockMine":
        out.add("MINE");
        break;
      case "unlockMintworks":
        out.add("MINTWORKS");
        break;
      case "unlockGranary":
        out.add("GRANARY");
        break;
      case "unlockSeedGranaryUpgrade":
        out.add("SEED_GRANARY");
        break;
      case "unlockCensusHall":
        out.add("CENSUS_HALL");
        break;
      case "unlockClearingHouse":
        out.add("CLEARING_HOUSE");
        break;
      case "unlockCaravanary":
        out.add("CARAVANARY");
        break;
      case "unlockUmbriteSynthesizer":
        out.add("UMBRITE_SYNTHESIZER");
        break;
      case "unlockTitaniumWorks":
        out.add("TITANIUM_WORKS");
        break;
      case "unlockCrystalSynthesizer":
        out.add("CRYSTAL_SYNTHESIZER");
        break;
      case "unlockAdvancedSynthesizers":
        out.add("ADVANCED_UMBRITE_SYNTHESIZER");
        out.add("ADVANCED_TITANIUM_WORKS");
        out.add("ADVANCED_CRYSTAL_SYNTHESIZER");
        break;
      case "unlockFoundry":
        out.add("FOUNDRY");
        break;
      case "unlockAetherTower":
        out.add("AETHER_TOWER");
        break;
      case "unlockCustomsHouse":
        out.add("CUSTOMS_HOUSE");
        break;
      case "unlockGovernorsOffice":
        out.add("GOVERNORS_OFFICE");
        break;
      case "unlockGarrisonHall":
        out.add("GARRISON_HALL");
        break;
      case "unlockAirport":
        out.add("AIRPORT");
        break;
      case "unlockAstralDock":
        out.add("ASTRAL_DOCK_PART_1");
        out.add("ASTRAL_DOCK_PART_2");
        out.add("ASTRAL_DOCK_PART_3");
        out.add("ASTRAL_DOCK");
        break;
      case "unlockRadarSystem":
        out.add("RADAR_SYSTEM");
        break;
      case "unlockImperialExchange":
        out.add("IMPERIAL_EXCHANGE_PART_1");
        out.add("IMPERIAL_EXCHANGE_PART_2");
        out.add("IMPERIAL_EXCHANGE_PART_3");
        out.add("IMPERIAL_EXCHANGE");
        break;
      case "unlockWorldEngine":
        out.add("WORLD_ENGINE_PART_1");
        out.add("WORLD_ENGINE_PART_2");
        out.add("WORLD_ENGINE_PART_3");
        out.add("WORLD_ENGINE");
        break;
      case "unlockAegisDome":
        out.add("AEGIS_DOME_PART_1");
        out.add("AEGIS_DOME_PART_2");
        out.add("AEGIS_DOME_PART_3");
        out.add("AEGIS_DOME");
        break;
      case "unlockRailDepot":
        out.add("RAIL_DEPOT");
        break;
      case "unlockLogisticsGuild":
        out.add("LOGISTICS_GUILD");
        break;
      case "unlockAssemblyWorks":
        out.add("ASSEMBLY_WORKS");
        break;
      // unlockWeaponsWorkshop retired — replaced by the two cases below.
      case "unlockTitaniumWeaponsFactory":
        out.add("TITANIUM_WEAPONS_FACTORY");
        break;
      case "unlockUmbriteWeaponsFactory":
        out.add("UMBRITE_WEAPONS_FACTORY");
        break;
      case "unlockPopulationBureau":
        out.add("POPULATION_BUREAU_PART_1");
        out.add("POPULATION_BUREAU_PART_2");
        out.add("POPULATION_BUREAU_PART_3");
        out.add("POPULATION_BUREAU");
        break;
      case "unlockTitaniumLevy":
        out.add("TITANIUM_LEVY_PART_1");
        out.add("TITANIUM_LEVY_PART_2");
        out.add("TITANIUM_LEVY_PART_3");
        out.add("TITANIUM_LEVY");
        break;
      case "unlockSiegeOutposts":
        out.add("SIEGE_OUTPOST");
        break;
      case "unlockSiegeTower":
        out.add("SIEGE_TOWER");
        break;
      case "unlockDreadTower":
        out.add("DREAD_TOWER");
        break;
      default:
        break;
    }
  }
  return [...out];
};

export const renderTechChoiceGrid = (deps: {
  state: {
    techTreeExpanded: boolean;
    techCatalog: TechInfo[];
    techUiSelectedId: string;
    techRootId: string | undefined;
    currentResearch: { techId?: string; completesAt?: number } | null | undefined;
    techTreeZoom: number; techAffordablePulseUntilByTechId: ReadonlyMap<string, number>;
  };
  effectiveOwnedTechIds: () => string[];
  effectiveTechChoices: () => string[];
  orderedTechIdsByTier: (catalog: TechInfo[]) => string[];
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds" | "requires">) => string[];
  techNameList: (ids: string[]) => string;
  isPendingTechUnlock: (techId: string) => boolean;
  formatCooldownShort: (ms: number) => string;
  titleCaseFromId: (id: string) => string;
  viewportHeight: number;
  isMobile: boolean;
}): string =>
  deps.state.techTreeExpanded
    ? renderExpandedTechChoiceTreeHtml({
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

export const renderTechDetailCard = (deps: {
  tech: TechInfo | undefined;
  techDetailOpen: boolean;
  techCatalog: TechInfo[];
  ownedTechIds: string[];
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds" | "requires">) => string[];
  unlockedByTech: (techId: string) => TechInfo[];
  isPendingTechUnlock: (techId: string) => boolean;
  pendingTechUnlockId: string;
  techNameList: (ids: string[]) => string;
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
}): string => {
  if (!deps.tech || !deps.techDetailOpen) return renderTechDetailPrompt();
  const byId = new Map(deps.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const prereqs = deps.techPrereqIds(deps.tech);
  const unlocks = deps.unlockedByTech(deps.tech.id);
  const owned = deps.ownedTechIds.includes(deps.tech.id);
  const prereqText = prereqs.length > 0 ? deps.techNameList(prereqs) : "Entry tech";
  const pendingUnlock = deps.isPendingTechUnlock(deps.tech.id);
  const canUnlock = !owned && deps.tech.requirements.canResearch && !deps.pendingTechUnlockId;
  const blockedSummary = !canUnlock && !pendingUnlock ? techBlockedReasonSummary(deps.tech, prereqs.length > 0 ? `Requires ${prereqText}` : "Entry tech") : null;
  const missingResources = techMissingResourceSummary(deps.tech);
  const statusText = pendingUnlock ? "Unlocking now. Waiting for server confirmation..." : owned ? "Already unlocked." : undefined;
  const buttonLabel = owned ? "Unlocked" : pendingUnlock ? "Unlocking..." : canUnlock ? "Unlock" : missingResources ? "Locked" : "Locked";
  const relatedStructures = relatedStructureTypesForTech(deps.tech);
  const relatedCrystalAbilities = relatedCrystalAbilitiesForTech(deps.tech);
  const relatedStructuresHtml =
    relatedStructures.length > 0
      ? `<p class="muted"><strong>Structures:</strong> ${relatedStructures.map((type) => deps.structureInfoButtonHtml(type)).join(", ")}</p>`
      : "";
  const relatedCrystalAbilitiesHtml =
    relatedCrystalAbilities.length > 0
      ? `<p class="muted"><strong>Abilities & actions:</strong> ${relatedCrystalAbilities.map((key) => crystalAbilityInfoButtonHtml(key)).join(", ")}</p>`
      : "";
  const highlightHtml = renderTechHighlightTagsHtml(deps.tech);
  const payoffHtml = highlightHtml
    ? `<section class="structure-info-section">
        <span class="structure-info-section-label">Unlock highlights</span>
        ${highlightHtml}
      </section>`
    : "";
  const cardHtml = renderTechDetailCardHtml({
    tech: deps.tech,
    statusText,
    buttonLabel,
    buttonDisabled: !(canUnlock || pendingUnlock),
    prereqs,
    prereqText,
    unlocks: unlocks.map((next) => ({ id: next.id, name: next.name, tier: deps.techTier(next.id, byId, tierMemo) })),
    relatedStructuresHtml,
    relatedCrystalAbilitiesHtml,
    payoffHtml: payoffHtml + renderResourceRevealHtml(deps.tech),
    blockedSummary: blockedSummary?.tone === "blocked" ? blockedSummary : null
  });
  return `<article class="card tech-detail-card tech-detail-card-shell">
    <div class="tech-detail-inline-head">
      <div class="tech-detail-kicker">Technology</div>
      <button class="tech-detail-close tech-detail-close-inline" type="button" aria-label="Close tech details" data-tech-detail-close="button">×</button>
    </div>
    <div class="tech-detail-inline-scroll">
      ${cardHtml}
    </div>
  </article>`;
};

export const renderTechDetailModal = (deps: {
  tech: TechInfo;
  techCatalog: TechInfo[];
  ownedTechIds: string[];
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds" | "requires">) => string[];
  unlockedByTech: (techId: string) => TechInfo[];
  isPendingTechUnlock: (techId: string) => boolean;
  pendingTechUnlockId: string;
  techNameList: (ids: string[]) => string;
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
}): string => {
  const byId = new Map(deps.techCatalog.map((item) => [item.id, item]));
  const tierMemo = new Map<string, number>();
  const prereqs = deps.techPrereqIds(deps.tech);
  const unlocks = deps.unlockedByTech(deps.tech.id);
  const owned = deps.ownedTechIds.includes(deps.tech.id);
  const pendingUnlock = deps.isPendingTechUnlock(deps.tech.id);
  const canUnlock = !owned && deps.tech.requirements.canResearch && !deps.pendingTechUnlockId;
  const blockedSummary = !canUnlock && !pendingUnlock ? techBlockedReasonSummary(deps.tech, prereqs.length > 0 ? `Requires ${deps.techNameList(prereqs)}` : "Entry tech") : null;
  const missingResources = techMissingResourceSummary(deps.tech);
  const statusText = pendingUnlock
    ? "Unlocking now. Waiting for server confirmation..."
    : owned
      ? "Already unlocked."
      : deps.tech.requirements.canResearch
      ? "Ready to unlock."
      : prereqs.length > 0
        ? `Requires ${deps.techNameList(prereqs)}`
        : "Entry tech";
  const buttonLabel = owned ? "Unlocked" : pendingUnlock ? "Unlocking..." : canUnlock ? "Unlock" : missingResources ? "Locked" : "Locked";
  const relatedStructures = relatedStructureTypesForTech(deps.tech);
  const relatedCrystalAbilities = relatedCrystalAbilitiesForTech(deps.tech);
  const requirements = deps.tech.requirements.checklist ?? [];
  const highlightHtml = renderTechHighlightTagsHtml(deps.tech);
  const requirementsHtml =
    requirements.length > 0
      ? `<ul class="tech-req-list">${requirements
          .map((item) => `<li class="${item.met ? "ok" : "bad"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
          .join("")}</ul>`
      : `<ul class="tech-req-list"><li>None</li></ul>`;
  return `<div class="tech-detail-backdrop" data-tech-detail-close="backdrop"></div>
    <div class="tech-detail-modal">
      <button class="tech-detail-close" type="button" aria-label="Close tech details" data-tech-detail-close="button">×</button>
      <div class="tech-detail-scroll">
        <div class="tech-detail-modal-head">
          <div>
            <div class="tech-detail-kicker">Technology</div>
            <h3>${deps.tech.name}</h3>
            ${highlightHtml}
            <p class="muted">${statusText}</p>
          </div>
        </div>
        <div class="tech-detail-section-stack">
          <p class="tech-detail-flavor">${deps.tech.description}</p>
          ${
            blockedSummary && blockedSummary.tone === "blocked"
              ? `<section class="tech-block-state tech-block-state-${blockedSummary.tone}">
                  <span class="structure-info-section-label">Locked by</span>
                  <strong>${blockedSummary.label}</strong>
                </section>`
              : ""
          }
        ${renderResourceRevealHtml(deps.tech)}
        ${
          relatedStructures.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Structures</span>
                <strong>${relatedStructures.map((type) => deps.structureInfoButtonHtml(type)).join(", ")}</strong>
              </section>`
            : ""
        }
        ${
          relatedCrystalAbilities.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Abilities & actions</span>
                <strong>${relatedCrystalAbilities.map((key) => crystalAbilityInfoButtonHtml(key)).join(", ")}</strong>
              </section>`
            : ""
        }
        ${
          unlocks.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Unlocks next</span>
                <strong>${unlocks.map((next) => `<button class="inline-info-link" type="button" data-tech-card="${next.id}">${next.name} (T${deps.techTier(next.id, byId, tierMemo)})</button>`).join(", ")}</strong>
              </section>`
            : ""
        }
        <section class="structure-info-section">
          <span class="structure-info-section-label">Requirements</span>
          ${requirementsHtml}
        </section>
        </div>
      </div>
      <div class="tech-detail-actions">
        <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal${blockedSummary && blockedSummary.tone === "blocked" ? ` tech-unlock-btn-${blockedSummary.tone}` : ""}" data-tech-unlock="${deps.tech.id}" ${canUnlock || pendingUnlock ? "" : "disabled"}>${buttonLabel}</button>
      </div>
    </div>`;
};

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
