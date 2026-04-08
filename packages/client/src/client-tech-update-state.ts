import type { ClientState } from "./client-state.js";

type TechUpdateMessage = {
  status?: "started" | "completed" | undefined;
  techRootId?: string | undefined;
  currentResearch?: ClientState["currentResearch"] | undefined;
  techIds?: string[] | undefined;
  nextChoices?: string[] | undefined;
  availableTechPicks?: number | undefined;
  mods?: ClientState["mods"] | undefined;
  modBreakdown?: ClientState["modBreakdown"] | undefined;
  incomePerMinute?: number | undefined;
  missions?: ClientState["missions"] | undefined;
  techCatalog?: ClientState["techCatalog"] | undefined;
  domainIds?: string[] | undefined;
  domainChoices?: string[] | undefined;
  domainCatalog?: ClientState["domainCatalog"] | undefined;
  revealCapacity?: number | undefined;
  activeRevealTargets?: string[] | undefined;
};

export const applyTechUpdateToState = (
  state: ClientState,
  msg: TechUpdateMessage,
  pushFeed: (message: string, type: string, severity: string) => void
): void => {
  const status = msg.status;
  const pendingTechId = state.pendingTechUnlockId;
  const previousSelectedTechId = state.techUiSelectedId;
  state.techRootId = msg.techRootId;
  state.currentResearch = msg.currentResearch ?? undefined;
  state.pendingTechUnlockId = "";
  state.techIds = msg.techIds ?? [];
  state.techChoices = msg.nextChoices ?? [];
  state.availableTechPicks = msg.availableTechPicks ?? state.availableTechPicks;
  state.mods = msg.mods ?? state.mods;
  state.modBreakdown = msg.modBreakdown ?? state.modBreakdown;
  state.incomePerMinute = msg.incomePerMinute ?? state.incomePerMinute;
  state.missions = msg.missions ?? state.missions;
  state.techCatalog = msg.techCatalog ?? state.techCatalog;
  state.domainIds = msg.domainIds ?? state.domainIds;
  state.domainChoices = msg.domainChoices ?? state.domainChoices;
  state.domainCatalog = msg.domainCatalog ?? state.domainCatalog;
  state.revealCapacity = msg.revealCapacity ?? state.revealCapacity;
  state.activeRevealTargets = msg.activeRevealTargets ?? state.activeRevealTargets;

  if (status !== "completed") return;

  const completedTechId =
    pendingTechId && state.techIds.includes(pendingTechId) ? pendingTechId : state.techIds[state.techIds.length - 1];
  const completedTech = state.techCatalog.find((tech) => tech.id === completedTechId);
  pushFeed(`Research completed: ${completedTech?.name ?? completedTechId ?? "unknown"}.`, "tech", "success");

  state.techDetailOpen = false;
  state.structureInfoKey = "";
  state.crystalAbilityInfoKey = "";
  state.activePanel = "tech";
  state.mobilePanel = "tech";

  const preferredSelection =
    (previousSelectedTechId && state.techChoices.includes(previousSelectedTechId) && previousSelectedTechId) ||
    state.techChoices[0] ||
    completedTechId ||
    previousSelectedTechId;
  state.techUiSelectedId = preferredSelection ?? "";
};
