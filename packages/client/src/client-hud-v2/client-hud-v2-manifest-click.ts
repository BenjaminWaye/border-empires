import { screen, type HudV2Deps } from "./client-hud-v2-context.js";

/**
 * Clicks on the Manifest screen: lane folds, node picks, building/ability info chips, the Reveal
 * chip's jump to the Resources lens, and Commission. Split out of client-hud-v2-screens.ts.
 */
export const manifestClick = (deps: HudV2Deps, target: Element, rerender: () => void, closeToMap: () => void): boolean => {
  const lane = target.closest<HTMLElement>("[data-v2-manifest-lane]");
  if (lane) {
    const id = lane.dataset.v2ManifestLane ?? "";
    if (screen.manifestClosedLanes.has(id)) screen.manifestClosedLanes.delete(id);
    else screen.manifestClosedLanes.add(id);
    rerender();
    return true;
  }
  const pick = target.closest<HTMLElement>("[data-v2-manifest-select]");
  if (pick) {
    screen.manifestSelectedId = pick.dataset.v2ManifestSelect ?? "";
    rerender();
    return true;
  }
  // Building and ability chips open the same info card the old tech panel did (it draws above screens).
  const info = target.closest<HTMLElement>("[data-v2-info-structure], [data-v2-info-ability]");
  if (info) {
    deps.state.structureInfoKey = info.dataset.v2InfoStructure ?? "";
    deps.state.crystalAbilityInfoKey = info.dataset.v2InfoAbility ?? "";
    deps.renderHud();
    return true;
  }
  // A Manifest's Reveal chip: back to the map with the Resources lens on, where revealed deposits glow.
  if (target.closest("[data-v2-manifest-lens]")) {
    deps.state.showResourceOverlay = true;
    deps.state.showDiplomacyOverlay = false;
    closeToMap();
    deps.requestViewRefresh();
    return true;
  }
  const commission = target.closest<HTMLButtonElement>("[data-v2-manifest-commission]");
  if (commission && !commission.disabled) {
    deps.actionFlow.chooseTech(commission.dataset.v2ManifestCommission);
    return true;
  }
  return false;
};
