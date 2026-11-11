// Sortable list of the viewer's towns for the Towns panel, so a player can
// spot the towns producing the least/most gold or holding the most people
// without clicking through every town tile.
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import { openBuildSlotsForTown } from "./client-town-list-slots.js";

export type TownListSortKey = "gold" | "population" | "growth" | "slots";
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
  /** Support-ring tiles open for a new building; undefined for Settlements, which have no ring yet. */
  openSlots: number | undefined;
};

const SORT_COLUMNS: Array<{ key: TownListSortKey; label: string }> = [
  { key: "gold", label: "Gold/day" },
  { key: "population", label: "Pop" },
  { key: "growth", label: "Growth" },
  { key: "slots", label: "Slots" }
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

/** `towns` is any iterable holding the towns to list; `tiles` is the full map, read for each town's support ring. */
export const deriveTownListRows = (towns: Iterable<Tile>, me: string, tiles: ReadonlyMap<string, Tile>): TownListRow[] => {
  const rows: TownListRow[] = [];
  for (const tile of towns) {
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
      isFed: town.isFed !== false,
      openSlots: openBuildSlotsForTown(tiles, tile, me)
    });
  }
  return rows;
};

const sortValue = (row: TownListRow, key: TownListSortKey): number =>
  key === "gold"
    ? row.goldPerMinute
    : key === "population"
      ? row.population
      : key === "growth"
        ? row.growthPerMinute
        : (row.openSlots ?? -1); // Settlements (no ring) sort below a full town

/** Open build slots cell text: a count, or a dash for a Settlement with no support ring. */
export const formatOpenSlots = (openSlots: number | undefined): string => (openSlots === undefined ? "—" : String(openSlots));

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

export const townListCardHtml = (tiles: ReadonlyMap<string, Tile>, me: string, sort: TownListSort = currentSort): string => {
  const rows = sortTownListRows(deriveTownListRows(tiles.values(), me, tiles), sort);
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
            <strong title="Open build slots">${formatOpenSlots(row.openSlots)}</strong>
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
