// Runtime for the Towns screen: renders the table from your towns and handles
// its sort headers and rows. Split out of client-hud-v2-screens.ts (the router).

import { deriveTownListRows, sortTownListRows, toggleTownListSort, townListSort, type TownListSort, type TownListSortKey } from "../client-town-list/client-town-list.js";
import { writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { forgetMyTowns, myTowns, openTownAt } from "./client-hud-v2-town-runtime.js";
import { townsBannerHtml, townsBodyHtml } from "./client-hud-v2-towns.js";

const SORT_KEYS: ReadonlySet<string> = new Set<TownListSortKey>(["gold", "population", "growth"]);

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
  const rows = sortTownListRows(deriveTownListRows(towns, deps.state.me), sort);
  writeHtml("v2s-head-right", townsBannerHtml(rows));
  writeHtml("v2s-body", townsBodyHtml(rows, sort));
};

/** Clicks on the Towns screen; true when handled. `closeList` closes the screen to the map. */
export const townsClick = (deps: HudV2Deps, target: Element, closeList: () => void): boolean => {
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
