import { formatTechBenefitSummary } from "./client-tech-html.js";
import type { TechInfo } from "./client-types.js";

const TECH_TREE_NODE_W = 216;
const TECH_TREE_NODE_MIN_H = 144;
const TECH_TREE_COL_GAP = 34;
const TECH_TREE_MIN_ROW_GAP = 118;
const TECH_TREE_IDEAL_ROW_GAP = 18;
const TECH_TREE_TIER_SPREAD = 248;
const TECH_TREE_ZIP_RATIO = 0.54;
const TECH_TREE_PADDING_X = 36;
const TECH_TREE_PADDING_Y = 28;

type TechTreeNodeLayout = {
  tech: TechInfo;
  tier: number;
  row: number;
  x: number;
  y: number;
  height: number;
};

type CurrentResearch = { techId?: string; completesAt?: number } | null | undefined;

type TechTreeArgs = {
  techCatalog: TechInfo[];
  techUiSelectedId: string | undefined;
  techRootId: string | undefined;
  currentResearch: CurrentResearch;
  effectiveOwnedTechIds: string[];
  effectiveTechChoices: string[];
  orderedTechIdsByTier: (catalog: TechInfo[]) => string[];
  techTier: (id: string, byId: Map<string, TechInfo>, tierMemo: Map<string, number>) => number;
  techPrereqIds: (tech: TechInfo) => string[];
  techNameList: (ids: string[]) => string;
  formatTechCost: (tech: TechInfo) => string;
  isPendingTechUnlock: (techId: string) => boolean;
  formatCooldownShort: (ms: number) => string;
  titleCaseFromId: (id: string) => string;
  viewportHeight: number;
  isMobile: boolean;
};

const techTierSlotWidth = (): number => TECH_TREE_NODE_W + TECH_TREE_TIER_SPREAD * 2;

const techTierNodeOffset = (index: number, count: number): number => {
  if (count <= 1) return TECH_TREE_TIER_SPREAD * 0.5;
  const lane = index % 2;
  return Math.round(lane === 0 ? 0 : TECH_TREE_TIER_SPREAD);
};

const estimateTechNodeHeight = (tech: TechInfo, args: Pick<TechTreeArgs, "techPrereqIds" | "techNameList" | "formatTechCost">): number => {
  const titleLines = Math.max(1, Math.ceil(tech.name.length / 14));
  const summaryText = formatTechBenefitSummary(tech);
  const summaryLines = Math.max(1, Math.ceil(summaryText.length / 30));
  const prereqText = args.techPrereqIds(tech).length > 0 ? `Requires ${args.techNameList(args.techPrereqIds(tech))}` : "Entry technology";
  const costText = tech.requirements.canResearch ? args.formatTechCost(tech) : prereqText;
  const costLines = Math.max(1, Math.ceil(costText.length / 30));
  const estimate = 28 + titleLines * 24 + 18 + summaryLines * 20 + costLines * 20 + 26;
  return Math.max(TECH_TREE_NODE_MIN_H, estimate);
};

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const deriveRootId = (
  techId: string,
  byId: Map<string, TechInfo>,
  techPrereqIds: TechTreeArgs["techPrereqIds"],
  memo: Map<string, string>
): string => {
  const cached = memo.get(techId);
  if (cached) return cached;
  const tech = byId.get(techId);
  if (!tech) return techId;
  if (tech.rootId) {
    memo.set(techId, tech.rootId);
    return tech.rootId;
  }
  const prereqs = techPrereqIds(tech);
  if (prereqs.length === 0) {
    memo.set(techId, tech.id);
    return tech.id;
  }
  const root = deriveRootId(prereqs[0]!, byId, techPrereqIds, memo);
  memo.set(techId, root);
  return root;
};

export const renderCompactTechChoiceGridHtml = (args: TechTreeArgs): string => {
  const byId = new Map(args.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const techLayoutOrder = new Map(args.orderedTechIdsByTier(args.techCatalog).map((id, index) => [id, index]));
  const ownedSet = new Set(args.effectiveOwnedTechIds);
  const choiceSet = new Set(args.effectiveTechChoices);
  const techs = args.techCatalog
    .slice()
    .sort(
      (a, b) =>
        args.techTier(a.id, byId, tierMemo) - args.techTier(b.id, byId, tierMemo) ||
        (techLayoutOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (techLayoutOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name)
    );
  if (techs.length === 0) return `<article class="card"><p>No technologies are available this season.</p></article>`;
  const grouped = new Map<number, TechInfo[]>();
  for (const tech of techs) {
    const tier = args.techTier(tech.id, byId, tierMemo);
    const arr = grouped.get(tier) ?? [];
    arr.push(tech);
    grouped.set(tier, arr);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  return tiers
    .map((tier) => {
      const cards = (grouped.get(tier) ?? [])
        .sort(
          (a, b) =>
            (techLayoutOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (techLayoutOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name)
        )
        .map((tech) => {
          const selected = args.techUiSelectedId === tech.id ? " selected" : "";
          const owned = ownedSet.has(tech.id) ? " owned" : "";
          const pending = args.isPendingTechUnlock(tech.id);
          const available = tech.requirements.canResearch && !pending;
          const choice = choiceSet.has(tech.id) ? " choice" : "";
          const blocked = owned || available || pending ? "" : " blocked";
          const researchingThis = args.currentResearch?.techId === tech.id;
          const researchRemaining =
            researchingThis && typeof args.currentResearch?.completesAt === "number"
              ? Math.max(0, args.currentResearch.completesAt - Date.now())
              : 0;
          const stateLabel = researchingThis ? "Researching" : pending ? "Unlocking" : owned ? "Unlocked" : available ? "Available" : "Locked";
          const costLabel = researchingThis
            ? `Researching • ${args.formatCooldownShort(researchRemaining)}`
            : pending
              ? "Unlocking..."
              : available
                ? args.formatTechCost(tech)
                : args.techPrereqIds(tech).length > 0
                  ? `Requires ${args.techNameList(args.techPrereqIds(tech))}`
                  : "Entry technology";
          return `<button class="tech-card${selected}${owned}${choice}${blocked}" data-tech-card="${tech.id}">
            <div class="tech-card-top">
              <strong>${tech.name}</strong>
              <span class="tech-root">${stateLabel}</span>
            </div>
            <p>${formatTechBenefitSummary(tech)}</p>
            <p class="tech-card-cost">${costLabel}</p>
          </button>`;
        })
        .join("");
      return `<div class="tech-tier-block"><h4>Tier ${tier}</h4><div class="tech-card-grid">${cards}</div></div>`;
    })
    .join("");
};

export const renderExpandedTechChoiceTreeHtml = (args: TechTreeArgs): string => {
  const byId = new Map(args.techCatalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const ownedTechIds = args.effectiveOwnedTechIds;
  const ownedSet = new Set(ownedTechIds);
  const choicesSet = new Set(args.effectiveTechChoices);
  const rootMemo = new Map<string, string>();
  if (args.techCatalog.length === 0) return `<article class="card"><p>No technologies are available this season.</p></article>`;

  const childrenByTech = new Map<string, string[]>();
  for (const tech of args.techCatalog) {
    for (const prereqId of args.techPrereqIds(tech)) {
      const children = childrenByTech.get(prereqId) ?? [];
      children.push(tech.id);
      childrenByTech.set(prereqId, children);
    }
  }
  for (const [key, children] of childrenByTech) {
    childrenByTech.set(
      key,
      children.sort((a, b) => {
        const aTech = byId.get(a);
        const bTech = byId.get(b);
        return (aTech?.name ?? a).localeCompare(bTech?.name ?? b);
      })
    );
  }

  const groupedByRoot = new Map<string, TechInfo[]>();
  for (const tech of args.techCatalog) {
    const rootKey = deriveRootId(tech.id, byId, args.techPrereqIds, rootMemo);
    const group = groupedByRoot.get(rootKey) ?? [];
    group.push(tech);
    groupedByRoot.set(rootKey, group);
  }

  const currentRootId =
    args.techRootId ||
    (() => {
      const owned = args.techCatalog.find((tech) => ownedSet.has(tech.id));
      return owned ? deriveRootId(owned.id, byId, args.techPrereqIds, rootMemo) : "";
    })();
  const rootKeys = [...groupedByRoot.keys()].sort((a, b) => {
    const aCurrent = a === currentRootId ? 1 : 0;
    const bCurrent = b === currentRootId ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    const aOwned = (groupedByRoot.get(a) ?? []).some((tech) => ownedSet.has(tech.id)) ? 1 : 0;
    const bOwned = (groupedByRoot.get(b) ?? []).some((tech) => ownedSet.has(tech.id)) ? 1 : 0;
    if (aOwned !== bOwned) return bOwned - aOwned;
    return (byId.get(a)?.name ?? args.titleCaseFromId(a)).localeCompare(byId.get(b)?.name ?? args.titleCaseFromId(b));
  });

  let leafRow = 0;
  const rowByTech = new Map<string, number>();
  const assigning = new Set<string>();
  const assignRow = (techId: string): number => {
    const cached = rowByTech.get(techId);
    if (typeof cached === "number") return cached;
    if (assigning.has(techId)) {
      const fallback = leafRow;
      leafRow += 1;
      rowByTech.set(techId, fallback);
      return fallback;
    }
    assigning.add(techId);
      const techRoot = deriveRootId(techId, byId, args.techPrereqIds, rootMemo);
      const children = (childrenByTech.get(techId) ?? []).filter((childId) => deriveRootId(childId, byId, args.techPrereqIds, rootMemo) === techRoot);
    let row: number;
    if (children.length === 0) {
      row = leafRow;
      leafRow += 1;
    } else {
      const childRows = children.map(assignRow);
      row = childRows.reduce((sum, value) => sum + value, 0) / childRows.length;
    }
    assigning.delete(techId);
    rowByTech.set(techId, row);
    return row;
  };

  for (const rootKey of rootKeys) {
    const rootTechs = (groupedByRoot.get(rootKey) ?? []).slice();
    const groupIds = new Set(rootTechs.map((tech) => tech.id));
    const entryTechs = rootTechs
      .filter((tech) => args.techPrereqIds(tech).filter((id) => groupIds.has(id)).length === 0)
      .sort((a, b) => args.techTier(a.id, byId, tierMemo) - args.techTier(b.id, byId, tierMemo) || a.name.localeCompare(b.name));
    for (const tech of entryTechs) assignRow(tech.id);
    for (const tech of rootTechs.sort((a, b) => args.techTier(a.id, byId, tierMemo) - args.techTier(b.id, byId, tierMemo) || a.name.localeCompare(b.name))) {
      if (!rowByTech.has(tech.id)) assignRow(tech.id);
    }
    leafRow += 1;
  }

  const stageHeight = Math.max(420, args.viewportHeight - (args.isMobile ? 220 : 190));
  const usableHeight = Math.max(220, stageHeight - TECH_TREE_PADDING_Y * 2);
  const techsByTier = new Map<number, TechInfo[]>();
  for (const tech of args.techCatalog) {
    const tier = args.techTier(tech.id, byId, tierMemo);
    const group = techsByTier.get(tier) ?? [];
    group.push(tech);
    techsByTier.set(tier, group);
  }

  const orderedTiers = [...techsByTier.keys()].sort((a, b) => a - b);
  const orderedIdsByTier = new Map<number, string[]>();
  for (const tier of orderedTiers) {
    const ids = (techsByTier.get(tier) ?? [])
      .slice()
      .sort((a, b) => {
        const aOrder = rowByTech.get(a.id) ?? 0;
        const bOrder = rowByTech.get(b.id) ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      })
      .map((tech) => tech.id);
    orderedIdsByTier.set(tier, ids);
  }

  const sortTierByLinkedNeighbors = (tier: number, direction: "parents" | "children"): void => {
    const ids = orderedIdsByTier.get(tier);
    if (!ids || ids.length <= 1) return;
    const neighborTierIds = orderedIdsByTier.get(direction === "parents" ? tier - 1 : tier + 1);
    const neighborIndex = new Map((neighborTierIds ?? []).map((id, index) => [id, index]));
    const fallbackIndex = new Map(ids.map((id, index) => [id, index]));
    ids.sort((aId, bId) => {
      const aTech = byId.get(aId);
      const bTech = byId.get(bId);
      if (!aTech || !bTech) return 0;
      const aNeighbors =
        direction === "parents"
          ? args.techPrereqIds(aTech).filter((id) => neighborIndex.has(id))
          : (childrenByTech.get(aId) ?? []).filter((id) => neighborIndex.has(id));
      const bNeighbors =
        direction === "parents"
          ? args.techPrereqIds(bTech).filter((id) => neighborIndex.has(id))
          : (childrenByTech.get(bId) ?? []).filter((id) => neighborIndex.has(id));
      const aScore = aNeighbors.length > 0 ? average(aNeighbors.map((id) => neighborIndex.get(id) ?? 0)) : fallbackIndex.get(aId) ?? 0;
      const bScore = bNeighbors.length > 0 ? average(bNeighbors.map((id) => neighborIndex.get(id) ?? 0)) : fallbackIndex.get(bId) ?? 0;
      if (aScore !== bScore) return aScore - bScore;
      const aBase = rowByTech.get(aId) ?? 0;
      const bBase = rowByTech.get(bId) ?? 0;
      if (aBase !== bBase) return aBase - bBase;
      return aTech.name.localeCompare(bTech.name);
    });
  };

  for (let pass = 0; pass < 3; pass += 1) {
    for (const tier of orderedTiers) {
      if (tier > orderedTiers[0]!) sortTierByLinkedNeighbors(tier, "parents");
    }
    for (let index = orderedTiers.length - 1; index >= 0; index -= 1) {
      const tier = orderedTiers[index];
      if (tier === undefined || tier >= orderedTiers[orderedTiers.length - 1]!) continue;
      sortTierByLinkedNeighbors(tier, "children");
    }
  }

  const layouts: TechTreeNodeLayout[] = [];
  for (const tier of orderedTiers) {
    const tierTechs = (orderedIdsByTier.get(tier) ?? []).map((id) => byId.get(id)).filter((tech): tech is TechInfo => Boolean(tech));
    const count = tierTechs.length;
    const tierHeights = tierTechs.map((tech) => estimateTechNodeHeight(tech, args));
    const zipperSteps = tierHeights.slice(0, -1).map((height) => Math.max(TECH_TREE_MIN_ROW_GAP, height * TECH_TREE_ZIP_RATIO));
    const stackHeight =
      count === 0
        ? 0
        : tierHeights[0]! + zipperSteps.reduce((sum, step) => sum + step, 0) + Math.max(0, (tierHeights[count - 1]! - tierHeights[0]!) * 0.15);
    const startY = TECH_TREE_PADDING_Y + Math.max(0, (usableHeight - stackHeight) / 2);
    const tierBaseX = TECH_TREE_PADDING_X + (tier - 1) * (techTierSlotWidth() + TECH_TREE_COL_GAP);
    let currentY = startY;
    tierTechs.forEach((tech, index) => {
      const height = tierHeights[index] ?? TECH_TREE_NODE_MIN_H;
      layouts.push({
        tech,
        tier,
        row: index,
        x: tierBaseX + techTierNodeOffset(index, count),
        y: currentY,
        height
      });
      currentY += index < zipperSteps.length ? zipperSteps[index]! : 0;
    });
  }
  layouts.sort((a, b) => a.x - b.x || a.y - b.y);

  const maxTier = Math.max(...layouts.map((layout) => layout.tier));
  const stageWidth = TECH_TREE_PADDING_X * 2 + maxTier * techTierSlotWidth() + Math.max(0, maxTier - 1) * TECH_TREE_COL_GAP;
  const contentHeight = Math.max(stageHeight, ...layouts.map((layout) => layout.y + layout.height + TECH_TREE_PADDING_Y));
  const layoutById = new Map(layouts.map((layout) => [layout.tech.id, layout]));

  const tierHeaders = Array.from({ length: maxTier }, (_, index) => {
    const left = TECH_TREE_PADDING_X + index * (techTierSlotWidth() + TECH_TREE_COL_GAP);
    return `<div class="tech-tree-stage-tier" style="left:${left}px;width:${techTierSlotWidth()}px;">Tier ${index + 1}</div>`;
  }).join("");

  const lines = layouts
    .flatMap((layout) =>
      args.techPrereqIds(layout.tech)
        .map((prereqId) => {
          const source = layoutById.get(prereqId);
          if (!source) return "";
          const startX = source.x + TECH_TREE_NODE_W;
          const startY = source.y + source.height / 2;
          const endX = layout.x;
          const endY = layout.y + layout.height / 2;
          const controlOffset = Math.max(36, (endX - startX) * 0.45);
          const selectedClass = args.techUiSelectedId === prereqId ? " is-selected-outgoing" : args.techUiSelectedId === layout.tech.id ? " is-selected-incoming" : "";
          return `<path class="tech-tree-link${selectedClass}" d="M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}" />`;
        })
        .filter(Boolean)
    )
    .join("");

  const nodes = layouts
    .map((layout) => {
      const { tech } = layout;
      const selected = args.techUiSelectedId === tech.id ? " selected" : "";
      const owned = ownedSet.has(tech.id) ? " owned" : "";
      const pending = args.isPendingTechUnlock(tech.id) ? " pending" : "";
      const researchingThis = args.currentResearch?.techId === tech.id;
      const researchRemaining =
        researchingThis && typeof args.currentResearch?.completesAt === "number"
          ? Math.max(0, args.currentResearch.completesAt - Date.now())
          : 0;
      const available = tech.requirements.canResearch && !args.isPendingTechUnlock(tech.id) ? " available" : "";
      const choice = choicesSet.has(tech.id) ? " choice" : "";
      const blocked = owned || available || pending ? "" : " blocked";
      const prereqs = args.techPrereqIds(tech);
      const stateLabel = researchingThis ? "Researching" : pending ? "Unlocking" : owned ? "Unlocked" : tech.requirements.canResearch ? "Available" : "Locked";
      const costLabel =
        researchingThis
          ? `Researching • ${args.formatCooldownShort(researchRemaining)}`
          : pending
            ? "Waiting for server confirmation..."
            : tech.requirements.canResearch
              ? args.formatTechCost(tech)
              : prereqs.length > 0
                ? `Requires ${args.techNameList(prereqs)}`
                : "Entry technology";
      const rootId = deriveRootId(tech.id, byId, args.techPrereqIds, rootMemo);
      const rootName = byId.get(rootId)?.name ?? args.titleCaseFromId(rootId);
      return `<button
        class="tech-card tech-tree-card tech-tree-graph-node${selected}${owned}${pending}${available}${choice}${blocked}"
        data-tech-card="${tech.id}"
        style="left:${layout.x}px;top:${layout.y}px;width:${TECH_TREE_NODE_W}px;min-height:${layout.height}px;"
      >
        <div class="tech-card-top">
          <strong>${tech.name}</strong>
          <span class="tech-tree-card-badge">${stateLabel}</span>
        </div>
        <p class="tech-tree-card-branch">${rootName}</p>
        <p class="tech-tree-card-meta">${formatTechBenefitSummary(tech)}</p>
        <p class="tech-card-cost">${costLabel}</p>
      </button>`;
    })
    .join("");

  return `<article class="card tech-tree-shell expanded">
    <div class="tech-tree-shell-head">
      <div>
        <div class="domain-summary-kicker">Research</div>
        <strong>Technology tree</strong>
        <p>Drag horizontally from Tier 1 through Tier ${maxTier} to see how every unlock connects.</p>
      </div>
      <div class="tech-tree-overview-metrics">
        <span><strong>${ownedTechIds.length}</strong> unlocked</span>
        <span><strong>${args.techCatalog.filter((tech) => tech.requirements.canResearch).length}</strong> ready</span>
        <span><strong>${args.techCatalog.length}</strong> total</span>
      </div>
    </div>
    <div class="tech-tree-graph-scroll" data-tech-tree-scroll>
      <div class="tech-tree-graph-stage" style="width:${stageWidth}px;height:${contentHeight}px;min-height:${stageHeight}px;">
        ${tierHeaders}
        <svg class="tech-tree-graph-lines" viewBox="0 0 ${stageWidth} ${contentHeight}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
        ${nodes}
      </div>
    </div>
  </article>`;
};
