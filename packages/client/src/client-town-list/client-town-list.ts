// Sortable list of the viewer's towns for the Towns panel, so a player can
// spot the towns producing the least/most gold or holding the most people
// without clicking through every town tile.
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";

export type TownListSortKey = "gold" | "population" | "growth";
export type TownListSort = { key: TownListSortKey; descending: boolean };

export type TownListRow = {
  x: number;
  y: number;
  name: string;
  tierLabel: string;
  goldPerMinute: number;
  population: number;
  maxPopulation: number;
  growthPerMinute: number;
  isFed: boolean;
};

const SORT_COLUMNS: Array<{ key: TownListSortKey; label: string }> = [
  { key: "gold", label: "Gold/day" },
  { key: "population", label: "Pop" },
  { key: "growth", label: "Growth" }
];

// UI-only preference: kept here rather than on ClientState (which sits at
// its line cap) because nothing outside this card reads it.
let currentSort: TownListSort = { key: "gold", descending: true };

export const townListSort = (): TownListSort => currentSort;

/** Clicking the active column flips direction; a new column starts highest-first. */
export const nextTownListSort = (sort: TownListSort, key: TownListSortKey): TownListSort =>
  sort.key === key ? { key, descending: !sort.descending } : { key, descending: true };

// The gateway's renderable gate lets economy fields arrive missing (partial
// summaries), so anything absent reads as 0 rather than NaN.
const finiteOrZero = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Shared by both HUDs' town lists, so the order carries over between them. */
export const toggleTownListSort = (key: TownListSortKey): void => {
  currentSort = nextTownListSort(currentSort, key);
};

export const deriveTownListRows = (tiles: Iterable<Tile>, me: string): TownListRow[] => {
  const rows: TownListRow[] = [];
  for (const tile of tiles) {
    const town = tile.town;
    if (!town || tile.ownerId !== me || tile.fogged) continue;
    rows.push({
      x: tile.x,
      y: tile.y,
      name: town.name ?? tile.townName ?? `Town ${tile.x}, ${tile.y}`,
      tierLabel: displayTownPopulationTierLabel(town.populationTier),
      // Same figure as the map's tile label: yieldRate already applies
      // sabotage, dock income and the pre-first-tick settlement fallback.
      goldPerMinute: finiteOrZero(tile.yieldRate?.goldPerMinute ?? town.goldPerMinute),
      population: finiteOrZero(town.population),
      maxPopulation: finiteOrZero(town.maxPopulation),
      growthPerMinute: finiteOrZero(town.populationGrowthPerMinute),
      // Only flag a town unfed when the server says so, not when the field is missing.
      isFed: town.isFed !== false
    });
  }
  return rows;
};

const sortValue = (row: TownListRow, key: TownListSortKey): number =>
  key === "gold" ? row.goldPerMinute : key === "population" ? row.population : row.growthPerMinute;

export const sortTownListRows = (rows: TownListRow[], sort: TownListSort): TownListRow[] =>
  [...rows].sort((a, b) => {
    const diff = sortValue(a, sort.key) - sortValue(b, sort.key);
    if (diff !== 0) return sort.descending ? -diff : diff;
    return a.name.localeCompare(b.name);
  });

const formatCount = (value: number): string => Math.round(value).toLocaleString("en-US");

const formatGrowth = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
};

export const townListCardHtml = (tiles: Iterable<Tile>, me: string, sort: TownListSort = currentSort): string => {
  const rows = sortTownListRows(deriveTownListRows(tiles, me), sort);
  const headers = SORT_COLUMNS.map(({ key, label }) => {
    const active = sort.key === key;
    const arrow = active ? (sort.descending ? " ▼" : " ▲") : "";
    return `<button class="town-list-sort${active ? " is-active" : ""}" type="button" data-town-list-sort="${key}" aria-pressed="${active}">${label}${arrow}</button>`;
  }).join("");
  const body =
    rows.length === 0
      ? '<div class="economy-line muted"><span>No towns yet</span></div>'
      : rows
          .map(
            (row) => `<button class="town-list-row${row.isFed ? "" : " is-unfed"}" type="button" data-town-list-jump="${row.x},${row.y}">
            <span class="town-list-name">${escapeHtml(row.name)}<small>${row.tierLabel}${row.isFed ? "" : " · Unfed"}</small></span>
            <strong>${(row.goldPerMinute * 1440).toFixed(1)}</strong>
            <strong>${formatCount(row.population)}<small>/ ${formatCount(row.maxPopulation)}</small></strong>
            <strong>${formatGrowth(row.growthPerMinute)}<small>/min</small></strong>
          </button>`
          )
          .join("");
  return `<section class="card town-list-card">
    <strong class="town-list-count">${rows.length} town${rows.length === 1 ? "" : "s"}</strong>
    <div class="town-list-head"><span>Town</span>${headers}</div>
    <div class="town-list-body">${body}</div>
  </section>`;
};

export const bindTownListControls = (
  root: ParentNode,
  callbacks: { rerender: () => void; onJump: (x: number, y: number) => void }
): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-town-list-sort]").forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.townListSort as TownListSortKey | undefined;
      if (!key) return;
      toggleTownListSort(key);
      callbacks.rerender();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-town-list-jump]").forEach((btn) => {
    btn.onclick = () => {
      const [x, y] = (btn.dataset.townListJump ?? "").split(",").map(Number);
      if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return;
      callbacks.onJump(x, y);
    };
  });
};
