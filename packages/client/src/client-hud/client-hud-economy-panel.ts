// Builds the classic Economy panel from client state. Split out of
// client-hud.ts, which is over the file-line cap.

import { renderEconomyPanelHtml } from "../client-economy-html/client-economy-html.js";
import { domainSlotGrantFor } from "../client-economy-html/client-economy-slot-sources.js";
import type { ClientState } from "../client-state/client-state.js";

export type HudEconomyPanelDeps = {
  prettyToken: (token: string) => string;
  resourceIconHtml: (key: string) => string;
  rateToneClass: (value: number) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (structureType: string) => string;
  hasRevealedResourceCategory: (
    category: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE",
    techIds: readonly string[],
    techCatalog: ClientState["techCatalog"]
  ) => boolean;
};

export const hudEconomyPanelHtml = (state: ClientState, deps: HudEconomyPanelDeps): string => {
  const domainSlotGrant = domainSlotGrantFor(state.domainCatalog, state.domainIds, state.chosenTrickleResource);
  return renderEconomyPanelHtml({
    focus: state.economyFocus,
    integrityPct: state.defensibilityPct,
    gold: state.gold,
    me: state.me,
    incomePerMinute: state.incomePerMinute,
    strategicResources: state.strategicResources,
    storageCap: state.storageCap,
    strategicProductionPerMinute: state.strategicProductionPerMinute,
    resourceSlots: state.resourceSlots,
    dormantStructures: state.dormantStructures,
    ...(domainSlotGrant ? { domainSlotGrant } : {}),
    economyBreakdown: state.economyBreakdown,
    upkeepPerMinute: state.upkeepPerMinute,
    upkeepLastTick: state.upkeepLastTick,
    activeRevealTargetsCount: state.activeRevealTargets.length,
    tiles: state.tiles.values(),
    isMobile: window.matchMedia("(max-width: 900px)").matches,
    prettyToken: deps.prettyToken,
    resourceIconHtml: deps.resourceIconHtml,
    rateToneClass: deps.rateToneClass,
    resourceLabel: deps.resourceLabel,
    economicStructureName: deps.economicStructureName,
    isRevealed: (key) => deps.hasRevealedResourceCategory(key, state.techIds, state.techCatalog)
  });
};
