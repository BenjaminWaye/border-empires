// Phones: building on a town's plots is a map step, not a list-and-Place step
// (2026-11-18 playtest: the list showed 1.5 rows under the town card, Place
// named a building scrolled out of view, and the plot was picked for you,
// out of sight). Tapping a plot building on the town screen, or its Place,
// hides the town screen; the town's open plots glow on the map (2D and
// true-3D, via client-town-plot-placement.ts), the best one is chosen, a tap
// on another glowing plot moves it, and the bar at the foot builds or cancels.
// Desktop keeps the list and Place: its map stays visible beside the panels.
import { structureRequiresTownOrSupportTile } from "@border-empires/shared";
import { pushFeed } from "../client-alerts/client-alerts.js";
import { buildActionIconHtml } from "../client-build-menu-icons/client-build-menu-icons.js";
import { TOWN_PLOTS_TAKEN_REASON, townTileOpenPlotReason } from "../client-tile-action-logic/client-town-tile-support-gate.js";
import { structureTypeForTileAction } from "../client-tile-action-support/client-tile-action-support.js";
import { clearTownPlotPlacement, setTownPlotPlacement, townPlotPlacement, type TownPlotPlacement } from "../client-town-plot-placement/client-town-plot-placement.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { screen, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { townPlotCandidates } from "./client-hud-v2-town-build-target.js";
import { renderTownScreen, runTileActionOn, townScreenKeys } from "./client-hud-v2-town-runtime.js";

export const TOWN_PLOT_PICK_HOST_ID = "v2t-pick";

const keyOf = (t: { x: number; y: number }): string => `${t.x},${t.y}`;
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const isCompact = (): boolean => typeof document !== "undefined" && document.body.classList.contains("hud-v2-compact");

/** The town screen's town, when it is open on the town itself (a selected support tile already is the plot). */
const openTown = (deps: Pick<HudV2Deps, "state">): Tile | undefined => {
  const keys = townScreenKeys();
  if (screen.id !== "town" || !keys || keys.focusKey !== keys.townKey) return undefined;
  return deps.state.tiles.get(keys.townKey);
};

/** The town's buildable action `actionId` when it goes on one of the town's plots, else undefined. */
const plotAction = (deps: Pick<HudV2Deps, "actionFlow">, town: Tile, actionId: string): TileActionDef | undefined => {
  const type = structureTypeForTileAction(actionId as TileActionDef["id"]);
  if (!type || !structureRequiresTownOrSupportTile(type)) return undefined;
  return deps.actionFlow.tileMenuViewForTile(town).buildings.find((b) => b.id === actionId && !b.disabled);
};

export const townPlotPickBarHtml = (pick: TownPlotPlacement, action: Pick<TileActionDef, "id" | "label" | "cost">): string => {
  const [x, y] = pick.chosenKey.split(",");
  const others = pick.candidates.length - 1;
  const hint = pick.missed
    ? "Tap a glowing plot to build there"
    : `Plot (${x}, ${y})${others > 0 ? ` · tap another glowing plot to move it (${others} more open)` : " · the only open plot"}`;
  return `<div class="v2t-pick-bar">
    <div class="v2t-pick-head"><span class="v2t-pick-ico">${buildActionIconHtml(action.id) ?? ""}</span><span class="v2t-pick-text"><span class="v2t-pick-name">${esc(action.label)}</span>${action.cost ? `<span class="v2t-pick-cost">${esc(action.cost)}</span>` : ""}</span></div>
    <div class="v2t-pick-hint${pick.missed ? " v2t-warn" : ""}" role="status">${esc(hint)}</div>
    <div class="v2t-pick-acts"><button type="button" class="v2s-btn" data-v2-plot-pick="cancel">Cancel</button><button type="button" class="v2s-btn v2s-btn-primary" data-v2-plot-pick="confirm" data-hud-v2-action="${esc(action.id)}">Build here</button></div>
  </div>`;
};

const renderBar = (deps: HudV2Deps): void => {
  const pick = townPlotPlacement();
  const town = pick && deps.state.tiles.get(pick.townKey);
  const action = town && plotAction(deps, town, pick.actionId);
  writeHtml(TOWN_PLOT_PICK_HOST_ID, pick && action ? townPlotPickBarHtml(pick, action) : "");
};

const stop = (): void => {
  clearTownPlotPlacement();
  writeHtml(TOWN_PLOT_PICK_HOST_ID, "");
};

/** No plot can take it: say why, as the auto-placing Place does, rather than open an empty pick. */
const reportNoPlot = (deps: HudV2Deps, town: Tile): void => {
  pushFeed(deps.state, townTileOpenPlotReason(deps.state, town) ?? TOWN_PLOTS_TAKEN_REASON, "error", "warn");
  deps.renderHud();
};

const onPlotTap = (deps: HudV2Deps) => (x: number, y: number): boolean => {
  const pick = townPlotPlacement();
  // Another screen replaced the town screen without closing it: drop the pick and let the tap select.
  if (!pick || screen.id !== "town" || townScreenKeys()?.townKey !== pick.townKey) return false;
  const key = keyOf({ x, y });
  setTownPlotPlacement(pick.candidates.includes(key) ? { ...pick, chosenKey: key, missed: false } : { ...pick, missed: true });
  renderBar(deps);
  return true;
};

/** Starts the map pick for `actionId` on the open town screen; false when this press is not a phone plot build. */
export const startTownPlotPick = (deps: HudV2Deps, actionId: string): boolean => {
  if (!isCompact()) return false;
  const town = openTown(deps);
  if (!town || !plotAction(deps, town, actionId)) return false;
  const candidates = townPlotCandidates(deps, town, actionId as TileActionDef["id"]).map(keyOf);
  const first = candidates[0];
  if (!first) {
    reportNoPlot(deps, town);
    return true;
  }
  screen.townBuildSelection = actionId;
  setTownPlotPlacement({ townKey: keyOf(town), actionId, candidates, chosenKey: first }, onPlotTap(deps));
  renderBar(deps);
  deps.renderHud();
  return true;
};

/** Build here: re-checks the plot (it may have been taken since), then builds through the town screen's Place path. */
const confirm = (deps: HudV2Deps): void => {
  const pick = townPlotPlacement();
  const town = pick && deps.state.tiles.get(pick.townKey);
  if (!pick || !town) return stop();
  const fresh = townPlotCandidates(deps, town, pick.actionId as TileActionDef["id"]).map(keyOf);
  if (!fresh.includes(pick.chosenKey)) {
    const next = fresh[0];
    if (!next) {
      stop();
      reportNoPlot(deps, town);
      renderTownScreen(deps);
      return;
    }
    setTownPlotPlacement({ ...pick, candidates: fresh, chosenKey: next, missed: false });
    pushFeed(deps.state, "That plot can't take it any more; picked another open plot.", "info", "warn");
    renderBar(deps);
    return;
  }
  stop();
  screen.townBuildSelection = pick.actionId;
  runTileActionOn(deps, pick.actionId as TileActionDef["id"], pick.chosenKey, undefined);
};

/** Cancel (or Esc): back to the town screen, nothing built. */
export const cancelTownPlotPick = (deps: HudV2Deps): boolean => {
  if (!townPlotPlacement()) return false;
  stop();
  renderTownScreen(deps);
  deps.renderHud();
  return true;
};

/**
 * Town screen clicks this flow takes: the pick bar's buttons, and -- on a phone, with the town itself
 * selected -- a plot building's row or its Place, which start the pick instead of picking a plot unseen.
 */
export const townPlotPickClick = (deps: HudV2Deps, target: Element): boolean => {
  const bar = target.closest<HTMLElement>("[data-v2-plot-pick]");
  if (bar) {
    if (bar.dataset.v2PlotPick === "confirm") confirm(deps);
    else cancelTownPlotPick(deps);
    return true;
  }
  const row = target.closest<HTMLElement>("[data-v2-build-pick]")?.dataset.v2BuildPick;
  if (row) return startTownPlotPick(deps, row);
  const place = target.closest<HTMLButtonElement>("[data-hud-v2-action]");
  const keys = townScreenKeys();
  if (!place || place.disabled || !place.closest("#v2t-build") || place.dataset.targetKey !== keys?.townKey) return false;
  return startTownPlotPick(deps, place.dataset.hudV2Action ?? "");
};
