// Towns screen for the new HUD: every town you own in one sortable table, so
// the lowest and highest producers stand out. Rows open that town's screen.
// Rows and sort order come from the shared town list (client-town-list.ts).

import { escapeHtml as esc } from "../client-duke-panel/client-duke-escape.js";
import type { TownListRow, TownListSort, TownListSortKey } from "../client-town-list/client-town-list.js";

const COLUMNS: Array<{ key: TownListSortKey; label: string }> = [
  { key: "gold", label: "Gold/day" },
  { key: "population", label: "Population" },
  { key: "growth", label: "Growth/min" }
];

const count = (value: number): string => Math.round(value).toLocaleString("en-US");

const growth = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
};

export const townsBannerHtml = (rows: readonly TownListRow[]): string =>
  `<span class="v2s-meta"><b>${rows.length}</b> town${rows.length === 1 ? "" : "s"}</span>`;

export const townsBodyHtml = (rows: readonly TownListRow[], sort: TownListSort): string => {
  if (rows.length === 0) return `<div class="v2s-empty">No towns yet</div>`;
  const head = COLUMNS.map(({ key, label }) => {
    const active = sort.key === key;
    const arrow = active ? (sort.descending ? " ▼" : " ▲") : "";
    return `<button type="button" class="v2l-sort${active ? " v2l-sort-on" : ""}" data-v2-towns-sort="${key}" aria-pressed="${active}">${label}${arrow}</button>`;
  }).join("");
  const body = rows.map((row) => `<button type="button" class="v2l-row${row.isFed ? "" : " v2l-unfed"}" data-v2-towns-open="${row.x},${row.y}">
      <span class="v2l-name">${esc(row.name)}<small>${esc(row.tierLabel)}${row.isFed ? "" : " · Unfed"}</small></span>
      <span class="v2l-num">${(row.goldPerMinute * 1440).toFixed(1)}</span>
      <span class="v2l-num">${count(row.population)}<small>/ ${count(row.maxPopulation)}</small></span>
      <span class="v2l-num">${growth(row.growthPerMinute)}</span>
    </button>`).join("");
  return `<section class="v2l-table"><div class="v2l-head"><span>Town</span>${head}</div>${body}</section>`;
};
