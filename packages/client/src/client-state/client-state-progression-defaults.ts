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
  autoSettle: { status: "unloaded" } as import("../client-auto-settle-prompt/client-auto-settle-prefs.js").ClientAutoSettleState,
  relicMapHintsRevision: 0,
  guideTownLead: undefined as import("@border-empires/shared").GuideTownLead | undefined,
  /** The guide's camp lead (PLAYER_UPDATE guideCampLead): the nearest live Insurgent camp never seen; its guided flight is free. */
  guideCampLead: undefined as import("@border-empires/shared").GuideCampLead | undefined,
  relicMapHints: new Map<string, import("@border-empires/shared").RelicMapHint>(),
  wonderLastFreeRushBuyAt: undefined as number | undefined, // Quickforge: ms of last discounted rush-buy (0/undefined = unused) -- rush-buy price preview only, server is price-authoritative
  techChoices: [] as string[],
  // When the pending Manifest commission (pendingTechUnlockId) was sent; it stops blocking taps after a timeout.
  pendingTechUnlockAt: 0,
  techCatalog: [] as TechInfo[],
  techAffordableByTechId: new Map<string, boolean>(), techAffordablePulseUntilByTechId: new Map<string, number>(), // §7.3 "reward is ready" pulse tracking
  currentResearch: undefined as PendingResearch | undefined,
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
});
