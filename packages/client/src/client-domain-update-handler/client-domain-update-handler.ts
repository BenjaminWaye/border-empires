import { isChosenTrickleResource } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type DomainUpdateState = Pick<
  ClientState,
  | "pendingDomainUnlockId"
  | "developmentProcessLimit"
  | "activeDevelopmentProcessCount"
  | "domainIds"
  | "chosenTrickleResource"
  | "domainChoices"
  | "domainCatalog"
  | "revealCapacity"
  | "activeRevealTargets"
  | "mods"
  | "modBreakdown"
  | "incomePerMinute"
  | "missions"
  | "gold"
  | "strategicResources"
>;

// Extracted out of client-network.ts's ~2900-line WebSocket message handler
// (that file is well over the repo's 500-line cap and may not grow) so a
// clean self-contained branch lives in its own uncapped module instead.
// Pure code move -- same field-by-field merge logic as before.
export const applyDomainUpdateMessage = (
  msg: Record<string, unknown>,
  state: DomainUpdateState,
  deps: { clearQueuedDevelopmentDispatchPending: () => void; renderHud: () => void }
): void => {
  state.pendingDomainUnlockId = "";
  state.developmentProcessLimit = (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
  if (typeof msg.activeDevelopmentProcessCount === "number") deps.clearQueuedDevelopmentDispatchPending();
  state.activeDevelopmentProcessCount =
    (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
  state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
  const domainUpdateTrickle = (msg as { chosenTrickleResource?: unknown }).chosenTrickleResource;
  if (isChosenTrickleResource(domainUpdateTrickle)) state.chosenTrickleResource = domainUpdateTrickle;
  state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
  state.domainCatalog = (msg.domainCatalog as any[]) ?? state.domainCatalog;
  state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
  state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
  state.mods = (msg.mods as typeof state.mods) ?? state.mods;
  state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
  state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
  state.missions = (msg.missions as any[]) ?? state.missions;
  if (typeof msg.gold === "number") state.gold = msg.gold;
  if (msg.strategicResources && typeof msg.strategicResources === "object") {
    state.strategicResources = {
      ...state.strategicResources,
      ...(msg.strategicResources as Partial<typeof state.strategicResources>)
    };
  }
  deps.renderHud();
};
