// Runtime for the Towns screen: renders the table from your towns and handles
// its sort headers and rows. Split out of client-hud-v2-screens.ts (the router).

import { deriveTownListRows, sortTownListRows, toggleTownListSort, townListSort, type TownListSort, type TownListSortKey } from "../client-town-list/client-town-list.js";
import { garrisonPlannedTileKeys } from "../client-town-growth/client-town-growth.js";
import { writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { forgetMyTowns, myTowns, openTownAt } from "./client-hud-v2-town-runtime.js";
import { townsBannerHtml, townsBodyHtml } from "./client-hud-v2-towns.js";
import { confirmTownFocusForAll, pickTownFocus, pickTownFocusForAll } from "./client-hud-v2-town-focus-pick.js";
import type { TownsFocusState, TownsFocusView } from "./client-hud-v2-towns-focus.js";
import { TownFocusSchema, type TownFocus } from "@border-empires/shared";
import { shownTownFocus } from "../client-town-focus/client-town-focus.js";
import { isTownGrowthPaused } from "../client-town-growth/client-town-growth.js";
import type { ClientState } from "../client-state/client-state.js";

/** Key the "Set every town" confirmation by, since it belongs to the list rather than to one town. */
const ALL_TOWNS_KEY = "towns-list";
let armedAll: { focus: TownFocus; at: number } | undefined;

/** Each listed town's focus, read from live tiles: the town list itself is cached for a moment. */
const focusView = (state: Pick<ClientState, "tiles">, keys: readonly string[], nowMs = Date.now()): TownsFocusView => {
  const byKey = new Map<string, TownsFocusState>();
  for (const key of keys) {
    const town = state.tiles.get(key)?.town;
    if (town) byKey.set(key, { active: shownTownFocus(town), growthPaused: isTownGrowthPaused(town, { explainUnfed: true, nowMs }) });
  }
  return { byKey, ...(armedAll && nowMs - armedAll.at < 4_000 ? { confirmAll: armedAll.focus } : {}) };
};

const SORT_KEYS: ReadonlySet<string> = new Set<TownListSortKey>(["gold", "manpower", "population", "growth", "slots"]);

/** What the table was last built from: rebuilt only when the town list, sort or screen changes, not every HUD tick. */
let built: { towns: unknown; sort: TownListSort; body: HTMLElement | null } | undefined;

export const renderTownsScreen = (deps: HudV2Deps, options: { force?: boolean } = {}): void => {
  const towns = myTowns(deps);
  const sort = townListSort();
  const body = document.getElementById("v2s-body");
  if (!options.force && built && built.towns === towns && built.sort === sort && built.body === body) return;
  // Hold the rows still while the pointer is on them, so a press can't land on a row that just moved.
  if (!options.force && built?.body === body && document.querySelector(".v2l-table:hover")) return;
  built = { towns, sort, body };
  const rows = sortTownListRows(deriveTownListRows(towns, deps.state.me, deps.state.tiles, garrisonPlannedTileKeys(deps.state), deps.state.manpowerBreakdown.biotaTowns), sort);
  writeHtml("v2s-head-right", townsBannerHtml(rows));
  writeHtml("v2s-body", townsBodyHtml(rows, sort, focusView(deps.state, rows.map((row) => `${row.x},${row.y}`))));
  // A row reading "…" is waiting on a coin figure only a tile-detail reply carries; without this it stayed
  // at 0.0 until you opened that town (playtest 2026-11-16). The request throttles and dedupes itself.
  for (const row of rows) {
    if (!row.coinPending) continue;
    const tile = deps.state.tiles.get(`${row.x},${row.y}`);
    if (tile) deps.actionFlow.requestTileDetailIfNeeded(tile);
  }
};

/** Clicks on the Towns screen; true when handled. `closeList` closes the screen to the map. */
export const townsClick = (deps: HudV2Deps, target: Element, closeList: () => void): boolean => {
  // Focus icons sit beside each row, not inside its open-the-town button.
  const one = target.closest<HTMLElement>("[data-v2-towns-focus]");
  const oneFocus = TownFocusSchema.safeParse(one?.dataset.focus);
  if (one && oneFocus.success) {
    pickTownFocus(deps, one.dataset.v2TownsFocus ?? "", oneFocus.data);
    renderTownsScreen(deps, { force: true });
    return true;
  }
  const all = target.closest<HTMLButtonElement>("[data-v2-towns-focus-all]");
  const allFocus = TownFocusSchema.safeParse(all?.dataset.v2TownsFocusAll);
  if (all && allFocus.success) {
    if (!all.disabled) {
      // First press arms it; a second press within a few seconds switches every town.
      if (confirmTownFocusForAll(ALL_TOWNS_KEY, allFocus.data)) {
        armedAll = undefined;
        pickTownFocusForAll(deps, myTowns(deps), allFocus.data);
      } else armedAll = { focus: allFocus.data, at: Date.now() };
    }
    renderTownsScreen(deps, { force: true });
    return true;
  }
  const sortButton = target.closest<HTMLElement>("[data-v2-towns-sort]");
  if (sortButton) {
    const key = sortButton.dataset.v2TownsSort;
    if (key && SORT_KEYS.has(key)) {
      toggleTownListSort(key as TownListSortKey);
      renderTownsScreen(deps, { force: true });
    }
    return true;
  }
  const row = target.closest<HTMLElement>("[data-v2-towns-open]");
  if (!row) return false;
  const [x, y] = (row.dataset.v2TownsOpen ?? "").split(",").map(Number);
  const tile = x !== undefined && y !== undefined ? deps.state.tiles.get(`${x},${y}`) : undefined;
  if (!tile?.town || tile.ownerId !== deps.state.me) {
    // Lost or gone since the list was built: keep the list open and drop the stale row.
    forgetMyTowns();
    renderTownsScreen(deps, { force: true });
    return true;
  }
  closeList();
  openTownAt(deps, tile.x, tile.y);
  return true;
};
