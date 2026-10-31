import { createInitialAfcState } from "../client-afc-upgrades/client-afc-state.js";
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { TechInfo, DomainInfo, PendingResearch } from "../client-types.js";

export const createInitialProgressionState = () => ({
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  domainIds: [] as string[],
  ...createInitialAfcState(),
  // Locked sub-choice for Clockwork Stipend; undefined when not picked yet.
  chosenTrickleResource: undefined as ChosenTrickleResource | undefined,
  // Emperor-endorsement bonus (galaxy meta-layer Phase 1).
  autoSettle: { status: "unloaded" } as import("../client-auto-settle-prompt/client-auto-settle-prefs.js").ClientAutoSettleState, imperialWardCharges: undefined as number | undefined, imperialWardActiveUntil: undefined as number | undefined,
  relicMapHintsRevision: 0,
  relicMapHints: new Map<string, import("@border-empires/shared").RelicMapHint>(),
  wonderLastFreeRushBuyAt: undefined as number | undefined, // Quickforge: ms of last discounted rush-buy (0/undefined = unused) -- rush-buy price preview only, server is price-authoritative
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  techAffordableByTechId: new Map<string, boolean>(), techAffordablePulseUntilByTechId: new Map<string, number>(), // §7.3 "reward is ready" pulse tracking
  currentResearch: undefined as PendingResearch | undefined,
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
});
