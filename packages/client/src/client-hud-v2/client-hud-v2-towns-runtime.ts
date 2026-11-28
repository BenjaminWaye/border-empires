// Runtime for the Towns screen: renders the table from your towns and handles
// its sort headers and rows. Split out of client-hud-v2-screens.ts (the router).

import { deriveTownListRows, sortTownListRows, toggleTownListSort, townListSort, type TownListRow, type TownListSort, type TownListSortKey } from "../client-town-list/client-town-list.js";
import { garrisonPlannedTileKeys } from "../client-town-growth/client-town-growth.js";
import { screen, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { forgetMyTowns, myTowns, openTownAt } from "./client-hud-v2-town-runtime.js";
import { townsBannerHtml, townsBodyHtml } from "./client-hud-v2-towns.js";
import { pickTownFocus, pickTownFocusForAll, selectTownFocus, selectedTownFocus } from "./client-hud-v2-town-focus-pick.js";
import { townFocusLockedInMs, townTileAtFocus } from "../client-town-focus/client-town-focus-projection.js";
import type { TownsFocusState, TownsFocusView } from "./client-hud-v2-towns-focus.js";
import { TownFocusSchema, nextManpowerRefillAtMs, type TownFocus } from "@border-empires/shared";
import { shownTownFocus } from "../client-town-focus/client-town-focus.js";
import { isTownGrowthPaused } from "../client-town-growth/client-town-growth.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/** How long "Set every town" waits for its confirming second press. */
const CONFIRM_ALL_MS = 4_000;
/**
 * The armed "Set every town" focus. The button reads "Again: …" exactly while this is set, and a timer clears both
 * together, so the label never promises a confirm that has already lapsed (renders are held while hovering).
 */
let armedAll: { focus: TownFocus } | undefined;

/** Each listed town's focus. An ungarrisoned town gets none: the server applies focus to garrisoned towns only. */
const focusView = (state: Pick<ClientState, "tiles" | "me">, rows: readonly TownListRow[], nowMs = Date.now()): TownsFocusView => {
  const byKey = new Map<string, TownsFocusState>();
  for (const row of rows) {
    const key = `${row.x},${row.y}`;
    const town = state.tiles.get(key)?.town;
    if (!town || !row.garrisoned) continue;
    const selected = selectedTownFocus(key);
    byKey.set(key, { active: shownTownFocus(town), growthPaused: isTownGrowthPaused(town, { explainUnfed: true, nowMs }), lockedInMs: townFocusLockedInMs(town, nowMs), ...(selected ? { selected } : {}) });
  }
  // A change locks until the next refill, the same moment for every town (optimisticTownFocus).
  const lockForMs = state.me ? Math.max(0, nextManpowerRefillAtMs(state.me, nowMs) - nowMs) : undefined;
  return { byKey, ...(armedAll ? { confirmAll: armedAll.focus } : {}), ...(lockForMs !== undefined ? { lockForMs } : {}) };
};

const SORT_KEYS: ReadonlySet<string> = new Set<TownListSortKey>(["gold", "manpower", "population", "growth", "slots"]);

/** What the table was last built from: rebuilt only when the town list, sort or screen changes, not every HUD tick. */
let built: { towns: unknown; sort: TownListSort; body: HTMLElement | null; order: readonly string[] } | undefined;

/** `keepOrder`: redraw in the current row order, so a focus pick that changes a sorted figure can't move rows under the pointer. */
export const renderTownsScreen = (deps: HudV2Deps, options: { force?: boolean; keepOrder?: boolean } = {}): void => {
  const towns = myTowns(deps);
  const sort = townListSort();
  const body = document.getElementById("v2s-body");
  if (!options.force && built && built.towns === towns && built.sort === sort && built.body === body) return;
  // Hold the rows still while the pointer is on them, so a press can't land on a row that just moved.
  if (!options.force && built?.body === body && document.querySelector(".v2l-table:hover")) return;
  const previousOrder = options.keepOrder && built?.body === body ? built.order : undefined;
  // The town list is cached for a moment: read each town from live tiles, at its shown focus (or the one previewed
  // on its row), so Coin, MP and growth move the moment a focus is picked or confirmed.
  const shown = towns.map((tile) => townTileAtFocus(deps.state.tiles.get(`${tile.x},${tile.y}`) ?? tile));
  const live = shown.map((tile) => {
    const previewing = selectedTownFocus(`${tile.x},${tile.y}`);
    return previewing ? townTileAtFocus(tile, previewing) : tile;
  });
  const derive = (tiles: Tile[]): TownListRow[] =>
    deriveTownListRows(tiles, deps.state.me, deps.state.tiles, garrisonPlannedTileKeys(deps.state), deps.state.manpowerBreakdown.biotaTowns);
  // Sort on the towns as they stand, and show the preview in place: a previewed row must not jump away from its ✓.
  const rowByKey = new Map(derive(live).map((row) => [`${row.x},${row.y}`, row]));
  const sorted = sortTownListRows(derive(shown), sort).map((row) => rowByKey.get(`${row.x},${row.y}`) ?? row);
  const rank = new Map(previousOrder?.map((key, index) => [key, index]));
  const rows = previousOrder ? [...sorted].sort((a, b) => (rank.get(`${a.x},${a.y}`) ?? Infinity) - (rank.get(`${b.x},${b.y}`) ?? Infinity)) : sorted;
  built = { towns, sort, body, order: rows.map((row) => `${row.x},${row.y}`) };
  writeHtml("v2s-head-right", townsBannerHtml(rows));
  writeHtml("v2s-body", townsBodyHtml(rows, sort, focusView(deps.state, rows)));
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
    // A tap previews the focus on that row; its ✓ confirms.
    if (!(one as HTMLButtonElement).disabled) selectTownFocus(deps, one.dataset.v2TownsFocus ?? "", oneFocus.data);
    renderTownsScreen(deps, { force: true, keepOrder: true });
    return true;
  }
  const confirm = target.closest<HTMLElement>("[data-v2-towns-focus-confirm]");
  if (confirm) {
    const key = confirm.dataset.v2TownsFocusConfirm ?? "";
    const focus = selectedTownFocus(key);
    if (focus) pickTownFocus(deps, key, focus);
    renderTownsScreen(deps, { force: true, keepOrder: true });
    return true;
  }
  const all = target.closest<HTMLButtonElement>("[data-v2-towns-focus-all]");
  const allFocus = TownFocusSchema.safeParse(all?.dataset.v2TownsFocusAll);
  if (all && allFocus.success) {
    if (!all.disabled) {
      // First press arms it; a second press while the button reads "Again" switches every town.
      if (armedAll?.focus === allFocus.data) {
        armedAll = undefined;
        pickTownFocusForAll(deps, myTowns(deps), allFocus.data);
      } else {
        const armed = { focus: allFocus.data };
        armedAll = armed;
        setTimeout(() => {
          if (armedAll !== armed) return;
          armedAll = undefined;
          if (screen.id === "towns") renderTownsScreen(deps, { force: true, keepOrder: true });
        }, CONFIRM_ALL_MS);
      }
    }
    renderTownsScreen(deps, { force: true, keepOrder: true });
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
