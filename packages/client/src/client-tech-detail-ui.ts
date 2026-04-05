import {
  crystalAbilityInfoButtonHtml,
  relatedCrystalAbilitiesForTech,
} from "./client-crystal-ability-info.js";
import {
  currentDomainChoiceTier,
  ownedDomainByTier,
  renderDomainChoiceGridHtml,
  renderDomainDetailCardHtml,
  renderDomainProgressCardHtml,
  renderTechDetailCardHtml
} from "./client-tech-html.js";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "./client-tech-tree-html.js";
import type { DomainInfo, TechInfo } from "./client-types.js";
import type { StructureInfoKey } from "./client-map-display.js";

export const formatTechCost = (tech: TechInfo): string => {
  const checklist = tech.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /gold|food|iron|crystal|supply|shard/i.test(item.label)).map((item) => item.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallback = checklist.map((item) => item.label);
  return fallback.length > 0 ? fallback.join(" · ") : "Cost not listed";
};

export const relatedStructureTypesForTech = (tech: TechInfo): StructureInfoKey[] => {
  const out = new Set<StructureInfoKey>();
  const effects = tech.effects ?? {};
  for (const [key] of Object.entries(effects)) {
    if (key === "unlockForts" || key.startsWith("fort")) out.add("FORT");
    if (key === "unlockObservatory" || key.startsWith("observatory")) out.add("OBSERVATORY");
    if (key === "unlockFarmstead") out.add("FARMSTEAD");
    if (key === "unlockCamp") out.add("CAMP");
    if (key === "unlockMine") out.add("MINE");
    if (key === "unlockMarket" || key.startsWith("market")) out.add("MARKET");
    if (key === "unlockGranary" || key.startsWith("granary")) out.add("GRANARY");
    if (key === "unlockBank") out.add("BANK");
    if (key === "unlockCaravanary") out.add("CARAVANARY");
    if (key === "unlockFurSynthesizer") out.add("FUR_SYNTHESIZER");
    if (key === "unlockIronworks") out.add("IRONWORKS");
    if (key === "unlockCrystalSynthesizer") out.add("CRYSTAL_SYNTHESIZER");
    if (key === "unlockAdvancedSynthesizers") {
      out.add("ADVANCED_FUR_SYNTHESIZER");
      out.add("ADVANCED_IRONWORKS");
      out.add("ADVANCED_CRYSTAL_SYNTHESIZER");
    }
    if (key === "unlockFuelPlant") out.add("FUEL_PLANT");
    if (key === "unlockFoundry") out.add("FOUNDRY");
    if (key === "unlockCustomsHouse") out.add("CUSTOMS_HOUSE");
    if (key === "unlockGovernorsOffice") out.add("GOVERNORS_OFFICE");
    if (key === "unlockGarrisonHall") out.add("GARRISON_HALL");
    if (key === "unlockAirport") out.add("AIRPORT");
    if (key === "unlockRadarSystem") out.add("RADAR_SYSTEM");
    if (key === "unlockSiegeOutposts" || key.startsWith("outpost")) out.add("SIEGE_OUTPOST");
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
        isMobile: deps.isMobile
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
        isMobile: deps.isMobile
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

export const renderTechDetailPrompt = (): string =>
  `<article class="card tech-detail-placeholder">
    <strong>Inspect Technology</strong>
    <p>Tap any tech card to open its full description, related structures, prerequisites, and unlock action.</p>
  </article>`;

export const renderTechDetailCard = (deps: {
  tech: TechInfo | undefined;
  techDetailOpen: boolean;
  techCatalog: TechInfo[];
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
  const prereqText = prereqs.length > 0 ? deps.techNameList(prereqs) : "Entry tech";
  const pendingUnlock = deps.isPendingTechUnlock(deps.tech.id);
  const canUnlock = deps.tech.requirements.canResearch && !deps.pendingTechUnlockId;
  const statusText = pendingUnlock ? "Unlocking now. Waiting for server confirmation..." : undefined;
  const buttonLabel = pendingUnlock ? "Unlocking..." : canUnlock ? "Unlock" : "Locked";
  const relatedStructures = relatedStructureTypesForTech(deps.tech);
  const relatedCrystalAbilities = relatedCrystalAbilitiesForTech(deps.tech);
  const relatedStructuresHtml =
    relatedStructures.length > 0
      ? `<p class="muted"><strong>Structures:</strong> ${relatedStructures.map((type) => deps.structureInfoButtonHtml(type)).join(", ")}</p>`
      : "";
  const relatedCrystalAbilitiesHtml =
    relatedCrystalAbilities.length > 0
      ? `<p class="muted"><strong>Crystal abilities:</strong> ${relatedCrystalAbilities.map((key) => crystalAbilityInfoButtonHtml(key)).join(", ")}</p>`
      : "";
  const cardHtml = renderTechDetailCardHtml({
    tech: deps.tech,
    statusText,
    buttonLabel,
    buttonDisabled: !(canUnlock || pendingUnlock),
    prereqs,
    prereqText,
    unlocks: unlocks.map((next) => ({ name: next.name, tier: deps.techTier(next.id, byId, tierMemo) })),
    relatedStructuresHtml,
    relatedCrystalAbilitiesHtml
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

export const renderStructureInfoOverlay = (
  structureInfoKey: string,
  structureInfoForKey: (type: StructureInfoKey) => {
    title: string;
    detail: string;
    glyph: string;
    placement: string;
    image?: string;
    costBits: string[];
    buildTimeLabel: string;
  }
): string => {
  const type = structureInfoKey as StructureInfoKey | "";
  if (!type) return "";
  const info = structureInfoForKey(type);
  const costHtml = info.costBits.map((bit) => `<div class="structure-info-meta-card"><span>Cost</span><strong>${bit}</strong></div>`).join("");
  const artHtml = info.image
    ? `<div class="structure-info-art has-image"><img class="structure-info-image" src="${info.image}" alt="${info.title}" /></div>`
    : `<div class="structure-info-art"><div class="structure-info-glyph" aria-hidden="true">${info.glyph}</div></div>`;
  return `<div class="structure-info-backdrop" data-structure-info-close="backdrop"></div>
    <div class="structure-info-modal" role="dialog" aria-modal="true" aria-labelledby="structure-info-title">
      <button class="structure-info-close" type="button" aria-label="Close structure details" data-structure-info-close="button">×</button>
      <div class="structure-info-scroll">
        <div class="structure-info-hero">
          ${artHtml}
          <div class="structure-info-head">
            <div class="structure-info-kicker">Structure</div>
            <h3 id="structure-info-title">${info.title}</h3>
            <p>${info.detail}</p>
          </div>
        </div>
        <div class="structure-info-meta">
          ${costHtml}
          <div class="structure-info-meta-card"><span>Build time</span><strong>${info.buildTimeLabel}</strong></div>
          <div class="structure-info-meta-card"><span>Placement</span><strong>${info.placement}</strong></div>
        </div>
      </div>
    </div>`;
};

export const renderTechDetailModal = (deps: {
  tech: TechInfo;
  techCatalog: TechInfo[];
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds" | "requires">) => string[];
  unlockedByTech: (techId: string) => TechInfo[];
  isPendingTechUnlock: (techId: string) => boolean;
  pendingTechUnlockId: string;
  techNameList: (ids: string[]) => string;
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
  formatTechBenefitSummary: (tech: TechInfo) => string;
}): string => {
  const byId = new Map(deps.techCatalog.map((item) => [item.id, item]));
  const tierMemo = new Map<string, number>();
  const prereqs = deps.techPrereqIds(deps.tech);
  const unlocks = deps.unlockedByTech(deps.tech.id);
  const pendingUnlock = deps.isPendingTechUnlock(deps.tech.id);
  const canUnlock = deps.tech.requirements.canResearch && !deps.pendingTechUnlockId;
  const statusText = pendingUnlock
    ? "Unlocking now. Waiting for server confirmation..."
    : deps.tech.requirements.canResearch
      ? "Ready to unlock."
      : prereqs.length > 0
        ? `Requires ${deps.techNameList(prereqs)}`
        : "Entry tech";
  const buttonLabel = pendingUnlock ? "Unlocking..." : canUnlock ? "Unlock" : "Locked";
  const relatedStructures = relatedStructureTypesForTech(deps.tech);
  const relatedCrystalAbilities = relatedCrystalAbilitiesForTech(deps.tech);
  const requirements = deps.tech.requirements.checklist ?? [];
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
            <p class="tech-detail-effect">${deps.formatTechBenefitSummary(deps.tech)}</p>
            <p class="muted">${statusText}</p>
          </div>
        </div>
        <p class="tech-detail-flavor">${deps.tech.description}</p>
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
                <span class="structure-info-section-label">Crystal abilities</span>
                <strong>${relatedCrystalAbilities.map((key) => crystalAbilityInfoButtonHtml(key)).join(", ")}</strong>
              </section>`
            : ""
        }
        ${
          unlocks.length > 0
            ? `<section class="structure-info-section">
                <span class="structure-info-section-label">Unlocks next</span>
                <strong>${unlocks.map((next) => `${next.name} (T${deps.techTier(next.id, byId, tierMemo)})`).join(", ")}</strong>
              </section>`
            : ""
        }
        <section class="structure-info-section">
          <span class="structure-info-section-label">Requirements</span>
          ${requirementsHtml}
        </section>
      </div>
      <div class="tech-detail-actions">
        <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal" data-tech-unlock="${deps.tech.id}" ${canUnlock || pendingUnlock ? "" : "disabled"}>${buttonLabel}</button>
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

export const visibleShardCacheCount = (tiles: Iterable<{ fogged?: boolean; shardSite?: { kind: string } | null }>): number =>
  [...tiles].filter((tile) => !tile.fogged && tile.shardSite?.kind === "CACHE").length;

export const activeShardfallCount = (tiles: Iterable<{ fogged?: boolean; shardSite?: { kind: string } | null }>): number =>
  [...tiles].filter((tile) => !tile.fogged && tile.shardSite?.kind === "FALL").length;

export const renderDomainProgressCard = (deps: {
  tiles: Iterable<{ fogged?: boolean; shardSite?: { kind: string } | null }>;
  shardStock: number;
  domainCatalog: DomainInfo[];
  domainChoices: string[];
  domainIds: string[];
}): string =>
  renderDomainProgressCardHtml({
    visibleShardCacheCount: visibleShardCacheCount(deps.tiles),
    activeShardfallCount: activeShardfallCount(deps.tiles),
    shardStock: deps.shardStock,
    currentTier: currentDomainChoiceTier(deps.domainCatalog, deps.domainChoices),
    chosenDomainCount: deps.domainIds.length
  });

export const renderDomainDetailCard = (deps: {
  domainCatalog: DomainInfo[];
  domainUiSelectedId: string;
  domainIds: string[];
  domainChoices: string[];
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
    requiresTechName: domain ? deps.techNameList([domain.requiresTechId]) : ""
  });
};

export const renderDomainDetailOverlay = (deps: {
  domainCatalog: DomainInfo[];
  domainUiSelectedId: string;
  domainIds: string[];
  domainChoices: string[];
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
          techNameList: deps.techNameList
        })}
      </div>
    </div>`;
};
