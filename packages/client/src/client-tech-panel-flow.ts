import { defensivenessMultiplier } from "@border-empires/shared";
import { currentDomainChoiceTier, formatTechBenefitSummary } from "./client-tech-html.js";
import {
  renderDomainChoiceGrid as renderDomainChoiceGridFromModule,
  renderDomainDetailCard as renderDomainDetailCardFromModule,
  renderDomainDetailOverlay as renderDomainDetailOverlayFromModule,
  renderDomainProgressCard as renderDomainProgressCardFromModule,
  renderStructureInfoOverlay as renderStructureInfoOverlayFromModule,
  renderTechChoiceGrid as renderTechChoiceGridFromModule,
  renderTechDetailCard as renderTechDetailCardFromModule,
  renderTechDetailModal as renderTechDetailModalFromModule,
  renderTechDetailPrompt as renderTechDetailPromptFromModule,
  selectedTechInfo as selectedTechInfoFromModule
} from "./client-tech-detail-ui.js";
import type { ClientState } from "./client-state.js";
import type { DomainInfo, TechInfo } from "./client-types.js";
import type { StructureInfoKey } from "./client-map-display.js";

type TechPanelDeps = {
  state: ClientState;
  techPickEl: HTMLSelectElement;
  mobileTechPickEl: HTMLSelectElement;
  viewportSize: () => { width: number; height: number };
  isMobile: () => boolean;
  formatCooldownShort: (ms: number) => string;
  structureInfoForKey: (type: StructureInfoKey) => {
    title: string;
    detail: string;
    glyph: string;
    placement: string;
    image?: string;
    costBits: string[];
    buildTimeLabel: string;
  };
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
};

export const createClientTechPanelFlow = (deps: TechPanelDeps) => {
  const { state, techPickEl, mobileTechPickEl } = deps;

  const defensibilityPctFromTE = (t: number | undefined, e: number | undefined): number => {
    if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return state.defensibilityPct;
    return Math.max(0, Math.min(100, defensivenessMultiplier(t, e) * 100));
  };

  const techTier = (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>): number => {
    const cached = memo.get(id);
    if (typeof cached === "number") return cached;
    const t = byId.get(id);
    if (!t) return 1;
    const parents = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
    if (parents.length === 0) {
      memo.set(id, 1);
      return 1;
    }
    const parentTier = Math.max(...parents.map((p) => techTier(p, byId, memo)));
    const tier = parentTier + 1;
    memo.set(id, tier);
    return tier;
  };

  const techPrereqIds = (tech: Pick<TechInfo, "prereqIds" | "requires">): string[] =>
    tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];

  const orderedTechIdsByTier = (catalog: TechInfo[]): string[] => {
    const byId = new Map(catalog.map((tech) => [tech.id, tech]));
    const tierMemo = new Map<string, number>();
    const tiers = new Map<number, string[]>();
    const childrenById = new Map<string, string[]>();

    for (const tech of catalog) {
      const tier = techTier(tech.id, byId, tierMemo);
      const ids = tiers.get(tier) ?? [];
      ids.push(tech.id);
      tiers.set(tier, ids);
      for (const prereqId of techPrereqIds(tech)) {
        const children = childrenById.get(prereqId) ?? [];
        children.push(tech.id);
        childrenById.set(prereqId, children);
      }
    }

    const tierNumbers = [...tiers.keys()].sort((a, b) => a - b);
    for (const tier of tierNumbers) {
      const ids = tiers.get(tier);
      if (!ids) continue;
      ids.sort((a, b) => {
        const techA = byId.get(a);
        const techB = byId.get(b);
        return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
      });
    }

    const positionMap = (): Map<string, number> => {
      const map = new Map<string, number>();
      for (const tier of tierNumbers) {
        const ids = tiers.get(tier) ?? [];
        ids.forEach((id, index) => map.set(id, index));
      }
      return map;
    };

    const meanPosition = (ids: string[], positions: Map<string, number>): number | null => {
      const values = ids.map((id) => positions.get(id)).filter((value): value is number => typeof value === "number");
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const sortTier = (tier: number, anchorsFor: (id: string) => string[]): void => {
      const ids = tiers.get(tier);
      if (!ids || ids.length < 2) return;
      const positions = positionMap();
      ids.sort((a, b) => {
        const anchorA = meanPosition(anchorsFor(a), positions);
        const anchorB = meanPosition(anchorsFor(b), positions);
        if (anchorA !== null && anchorB !== null && anchorA !== anchorB) return anchorA - anchorB;
        if (anchorA !== null && anchorB === null) return -1;
        if (anchorA === null && anchorB !== null) return 1;
        const childA = meanPosition(childrenById.get(a) ?? [], positions);
        const childB = meanPosition(childrenById.get(b) ?? [], positions);
        if (childA !== null && childB !== null && childA !== childB) return childA - childB;
        if (childA !== null && childB === null) return -1;
        if (childA === null && childB !== null) return 1;
        const techA = byId.get(a);
        const techB = byId.get(b);
        return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
      });
    };

    for (let sweep = 0; sweep < 4; sweep += 1) {
      for (const tier of tierNumbers.slice(1)) sortTier(tier, (id) => techPrereqIds(byId.get(id) ?? {}));
      for (const tier of [...tierNumbers].reverse().slice(1)) sortTier(tier, (id) => childrenById.get(id) ?? []);
    }

    return tierNumbers.flatMap((tier) => tiers.get(tier) ?? []);
  };

  const titleCaseFromId = (value: string): string =>
    value
      .split("-")
      .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
      .join(" ");

  const techNameList = (ids: string[]): string =>
    ids
      .map((id) => state.techCatalog.find((t) => t.id === id)?.name ?? titleCaseFromId(id))
      .join(", ");

  const unlockedByTech = (techId: string): TechInfo[] =>
    state.techCatalog
      .filter((candidate) => {
        const prereqs =
          candidate.prereqIds && candidate.prereqIds.length > 0 ? candidate.prereqIds : candidate.requires ? [candidate.requires] : [];
        return prereqs.includes(techId);
      })
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  const effectiveOwnedTechIds = (): string[] => {
    if (!state.pendingTechUnlockId || state.techIds.includes(state.pendingTechUnlockId)) return state.techIds;
    return [...state.techIds, state.pendingTechUnlockId];
  };

  const effectiveTechChoices = (): string[] =>
    state.pendingTechUnlockId ? state.techChoices.filter((id) => id !== state.pendingTechUnlockId) : state.techChoices;

  const isPendingTechUnlock = (techId: string): boolean => state.pendingTechUnlockId === techId;

  const renderTechChoiceGrid = (): string =>
    renderTechChoiceGridFromModule({
      state,
      effectiveOwnedTechIds,
      effectiveTechChoices,
      orderedTechIdsByTier,
      techTier,
      techPrereqIds,
      techNameList,
      isPendingTechUnlock,
      formatCooldownShort: deps.formatCooldownShort,
      titleCaseFromId,
      viewportHeight: deps.viewportSize().height,
      isMobile: deps.isMobile()
    });

  const selectedTechInfo = (): TechInfo | undefined =>
    selectedTechInfoFromModule({
      techUiSelectedId: state.techUiSelectedId,
      desktopPickValue: techPickEl.value,
      mobilePickValue: mobileTechPickEl.value,
      techCatalog: state.techCatalog
    });

  const renderTechDetailPrompt = (): string => renderTechDetailPromptFromModule();

  const renderTechDetailCard = (): string =>
    renderTechDetailCardFromModule({
      tech: selectedTechInfo(),
      techDetailOpen: state.techDetailOpen,
      techCatalog: state.techCatalog,
      techPrereqIds,
      unlockedByTech,
      isPendingTechUnlock,
      pendingTechUnlockId: state.pendingTechUnlockId,
      techNameList,
      structureInfoButtonHtml: deps.structureInfoButtonHtml,
      techTier
    });

  const renderStructureInfoOverlay = (): string =>
    renderStructureInfoOverlayFromModule(state.structureInfoKey, deps.structureInfoForKey);

  const renderTechDetailModal = (): string => {
    const tech = selectedTechInfo();
    if (!tech) return "";
    return renderTechDetailModalFromModule({
      tech,
      techCatalog: state.techCatalog,
      techPrereqIds,
      unlockedByTech,
      isPendingTechUnlock,
      pendingTechUnlockId: state.pendingTechUnlockId,
      techNameList,
      structureInfoButtonHtml: deps.structureInfoButtonHtml,
      techTier,
      formatTechBenefitSummary
    });
  };

  const techDetailsUseOverlay = (): boolean => deps.isMobile();

  const renderDomainChoiceGrid = (): string =>
    renderDomainChoiceGridFromModule({
      domainCatalog: state.domainCatalog,
      domainIds: state.domainIds,
      domainUiSelectedId: state.domainUiSelectedId,
      domainChoices: state.domainChoices,
      techNameList
    });

  const renderDomainProgressCard = (): string =>
    renderDomainProgressCardFromModule({
      tiles: state.tiles.values(),
      shardStock: state.strategicResources.SHARD ?? 0,
      domainCatalog: state.domainCatalog,
      domainChoices: state.domainChoices,
      domainIds: state.domainIds
    });

  const renderTechDetailOverlay = (): string => {
    if (!state.techDetailOpen) return "";
    return renderTechDetailModal();
  };

  const renderDomainDetailCard = (): string =>
    renderDomainDetailCardFromModule({
      domainCatalog: state.domainCatalog,
      domainUiSelectedId: state.domainUiSelectedId,
      domainIds: state.domainIds,
      domainChoices: state.domainChoices,
      techNameList
    });

  const renderDomainDetailOverlay = (): string =>
    renderDomainDetailOverlayFromModule({
      domainCatalog: state.domainCatalog,
      domainUiSelectedId: state.domainUiSelectedId,
      domainIds: state.domainIds,
      domainChoices: state.domainChoices,
      techNameList
    });

  const renderTechChoiceDetails = (): string => "";

  const affordableTechChoicesCount = (): number => {
    const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
    let n = 0;
    for (const id of effectiveTechChoices()) {
      const t = catalogById.get(id);
      if (t && t.requirements.canResearch) n += 1;
    }
    return n;
  };

  return {
    defensibilityPctFromTE,
    techTier,
    techPrereqIds,
    orderedTechIdsByTier,
    titleCaseFromId,
    techNameList,
    unlockedByTech,
    currentDomainChoiceTier,
    effectiveOwnedTechIds,
    effectiveTechChoices,
    isPendingTechUnlock,
    renderTechChoiceGrid,
    selectedTechInfo,
    renderTechDetailPrompt,
    renderTechDetailCard,
    renderStructureInfoOverlay,
    renderTechDetailModal,
    techDetailsUseOverlay,
    renderDomainChoiceGrid,
    renderDomainProgressCard,
    renderTechDetailOverlay,
    renderDomainDetailCard,
    renderDomainDetailOverlay,
    renderTechChoiceDetails,
    affordableTechChoicesCount
  };
};
