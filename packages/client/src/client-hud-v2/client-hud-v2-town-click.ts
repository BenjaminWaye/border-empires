// The town screen's click handling, split out of client-hud-v2-screens.ts (which passes its closeScreen in,
// so this file does not import it back).
import { openTechDetailFromTileMenu } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import type { TileActionDef } from "../client-types.js";
import { focusCamera, screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { townPlotPickClick } from "./client-hud-v2-town-plot-pick.js";
import { garrisonPlotsClick } from "./client-hud-v2-town-garrison-plots.js";
import { renderTownScreen, runTileActionOn, runTownFocusConfirm, runTownFocusPick, runTownWork, stepTown } from "./client-hud-v2-town-runtime.js";
import { TownFocusSchema } from "@border-empires/shared";

type CloseScreen = (deps: HudV2Deps, options?: { toMap?: boolean }) => void;

/** Clicks inside the open town screen: the plot pick first, then steppers, build tabs and rows, work cards and tile actions. */
export const townClick = (deps: HudV2Deps, target: Element, closeScreen: CloseScreen): boolean => {
  if (townPlotPickClick(deps, target)) return true;
  const step = target.closest<HTMLElement>("[data-v2-town-step]");
  if (step) {
    stepTown(deps, Number(step.dataset.v2TownStep));
    return true;
  }
  const category = target.closest<HTMLElement>("[data-v2-build-category]");
  if (category) {
    screen.townCategory = category.dataset.v2BuildCategory as BuildingCategory;
    screen.townBuildSelection = undefined;
    renderTownScreen(deps);
    return true;
  }
  const build = target.closest<HTMLElement>("[data-v2-build-pick]");
  if (build) {
    screen.townBuildSelection = build.dataset.v2BuildPick;
    renderTownScreen(deps);
    return true;
  }
  // Biota next steps (client-hud-v2-town-biota.ts): a site's coordinates go to it on the map; the charter opens in the Manifest.
  const goto = target.closest<HTMLElement>("[data-v2-town-goto]")?.dataset.v2TownGoto?.split(",").map(Number);
  if (goto?.length === 2 && goto.every(Number.isFinite)) {
    closeScreen(deps, { toMap: true });
    focusCamera(deps, goto[0]!, goto[1]!);
    deps.renderHud();
    return true;
  }
  const tech = target.closest<HTMLElement>("[data-view-tech]")?.dataset.viewTech;
  if (tech) {
    openTechDetailFromTileMenu(deps.state, tech);
    deps.renderHud();
    return true;
  }
  if (target.closest("[data-v2-town-focus-confirm]")) {
    runTownFocusConfirm(deps);
    return true;
  }
  const focus = TownFocusSchema.safeParse(target.closest<HTMLElement>("[data-v2-town-focus]")?.dataset.v2TownFocus);
  if (focus.success) {
    runTownFocusPick(deps, focus.data);
    return true;
  }
  const work = target.closest<HTMLButtonElement>("[data-v2-work-action]");
  if (work) {
    if (!work.disabled && work.dataset.v2WorkAction && work.dataset.targetKey) runTownWork(deps, work.dataset.v2WorkAction, work.dataset.targetKey);
    return true;
  }
  if (garrisonPlotsClick(deps, target)) return true;
  const action = target.closest<HTMLButtonElement>("[data-hud-v2-action]");
  if (action && !action.disabled) {
    runTileActionOn(deps, action.dataset.hudV2Action as TileActionDef["id"], action.dataset.targetKey, action.dataset.originKey);
    return true;
  }
  return false;
};
