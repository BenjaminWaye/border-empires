// Runtime for the town screen: decides when a selected tile opens it (your
// town, or a tile in its support ring), renders it from the tile menu views,
// and runs town actions on the town even while a support tile is selected.

import type { Terrain } from "@border-empires/shared";
import { supportPlotAnchorTown } from "../client-town-support-plot-lookup.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { clearScreen, focusCamera, screen, screenCentre, setScreen, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { suppressAutoExpand } from "./client-hud-v2-tile-dock.js";
import { TOWN_SCREEN_SKELETON, townScreenRegions } from "./client-hud-v2-town.js";

type TownContext = { townKey: string; focusKey: string; focusView: TileMenuView };

let current: TownContext | undefined;

const keyOf = (t: { x: number; y: number }): string => `${t.x},${t.y}`;

/** The town this tile belongs to on the town screen, if any: your town itself, or the town whose support ring holds your tile. */
export const townForTile = (deps: Pick<HudV2Deps, "state" | "wrapX" | "wrapY">, tile: Tile | undefined): Tile | undefined => {
  const { state } = deps;
  if (!tile || tile.ownerId !== state.me) return undefined;
  if (tile.town) return tile;
  return supportPlotAnchorTown(tile, {
    tiles: state.tiles,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    keyFor: (x, y) => `${x},${y}`,
    terrainAt: (x, y): Terrain => state.tiles.get(`${x},${y}`)?.terrain ?? "LAND",
    me: state.me
  });
};

const TOWN_LIST_TTL_MS = 2_000;
let townListCache: { at: number; towns: Tile[] } | undefined;

/** Your towns in a stable order, for the ◁ ▷ steppers. Scans all tiles, so cached briefly. */
export const myTowns = (deps: Pick<HudV2Deps, "state">, nowMs = Date.now()): Tile[] => {
  if (townListCache && nowMs - townListCache.at < TOWN_LIST_TTL_MS) return townListCache.towns;
  const out: Tile[] = [];
  for (const tile of deps.state.tiles.values()) if (tile.town && tile.ownerId === deps.state.me) out.push(tile);
  out.sort((a, b) => (a.town?.name ?? "").localeCompare(b.town?.name ?? "") || a.x - b.x || a.y - b.y);
  townListCache = { at: nowMs, towns: out };
  return out;
};

export const renderTownScreen = (deps: HudV2Deps): void => {
  if (screen.id !== "town" || !current) return;
  const town = deps.state.tiles.get(current.townKey);
  const focus = deps.state.tiles.get(current.focusKey);
  if (!town || !focus) return;
  const townView = current.townKey === current.focusKey ? current.focusView : deps.actionFlow.tileMenuViewForTile(town);
  const towns = myTowns(deps);
  const regions = townScreenRegions({
    town,
    focus,
    townView,
    focusView: current.focusView,
    townIndex: Math.max(0, towns.findIndex((t) => keyOf(t) === current?.townKey)),
    townCount: towns.length,
    buildSelection: screen.townBuildSelection,
    category: screen.townCategory
  });
  writeHtml("v2t-left", regions.left);
  writeHtml("v2t-build", regions.build);
  writeHtml("v2t-place", regions.place);
  writeHtml("v2t-bar", regions.bar);
};

/** Dock listener: returns true when the town screen takes this tile. */
export const townOnMenuView = (deps: HudV2Deps, view: TileMenuView, tileKey: string): boolean => {
  if (screen.id !== null && screen.id !== "town") return false;
  const town = townForTile(deps, deps.state.tiles.get(tileKey));
  if (!town) {
    if (screen.id === "town") closeTownScreen();
    return false;
  }
  if (current?.focusKey !== tileKey) screen.townBuildSelection = undefined;
  current = { townKey: keyOf(town), focusKey: tileKey, focusView: view };
  if (screen.id !== "town" && deps.state.activePanel) {
    // A legacy side panel would sit under the build list; the town screen replaces it.
    deps.state.activePanel = null;
    queueMicrotask(deps.renderHud);
  }
  setScreen("town", TOWN_SCREEN_SKELETON);
  renderTownScreen(deps);
  return true;
};

export const closeTownScreen = (): void => {
  current = undefined;
  screen.townBuildSelection = undefined;
  if (screen.id === "town") clearScreen();
};

/** Runs a tile action on `targetKey` (the town) when the menu is open on another tile (a support tile). */
export const runTileActionOn = (deps: HudV2Deps, actionId: TileActionDef["id"], targetKey: string | undefined, originKey: string | undefined): void => {
  const menu = deps.state.tileActionMenu;
  const previous = menu.currentTileKey;
  if (!targetKey || targetKey === previous || menu.mode !== "single") {
    deps.actionFlow.handleTileAction(actionId, targetKey, originKey);
    return;
  }
  const target = deps.state.tiles.get(targetKey);
  menu.currentTileKey = targetKey;
  if (target) deps.state.selected = { x: target.x, y: target.y };
  deps.actionFlow.handleTileAction(actionId, targetKey, originKey);
  if (menu.visible && menu.currentTileKey === targetKey) {
    menu.currentTileKey = previous;
    const back = deps.state.tiles.get(previous);
    if (back) deps.state.selected = { x: back.x, y: back.y };
  }
};

/** ◁ ▷: open the previous / next town and move the camera there. */
export const stepTown = (deps: HudV2Deps, delta: number): void => {
  const towns = myTowns(deps);
  if (towns.length < 2 || !current) return;
  const at = towns.findIndex((t) => keyOf(t) === current?.townKey);
  const next = towns[(at + delta + towns.length) % towns.length];
  if (!next) return;
  focusCamera(deps, next.x, next.y);
  suppressAutoExpand();
  const centre = screenCentre();
  deps.actionFlow.openSingleTileActionMenu(next, centre.x, centre.y);
};
