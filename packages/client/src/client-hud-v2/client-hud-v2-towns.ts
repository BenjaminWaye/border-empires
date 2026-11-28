// Towns screen for the new HUD: every town you own in one sortable table, so
// the lowest and highest producers stand out. Rows open that town's screen.
// Rows and sort order come from the shared town list (client-town-list.ts).

import { escapeHtml as esc } from "../client-duke-panel/client-duke-escape.js";
import { formatOpenSlots, formatTownCoinPerDay, townRowWarning, type TownListRow, type TownListSort, type TownListSortKey } from "../client-town-list/client-town-list.js";
import { townsFocusBarHtml, townsFocusCellHtml, type TownsFocusView } from "./client-hud-v2-towns-focus.js";

const COLUMNS: Array<{ key: TownListSortKey; label: string; title: string }> = [
  { key: "gold", label: "Coin/day", title: "Coin per day" },
  { key: "manpower", label: "MP", title: "This town's own manpower per refill (every 4h) with its focus, before your empire's town-count weighting: beyond your first 5 towns each adds less" },
  // Short labels: at 375px the five columns are ~58px each, and "Population" / "Growth/min" ran into
  // each other (playtest day 1). The full meaning is in each header's title.
  { key: "population", label: "Pop", title: "Population / target" },
  { key: "growth", label: "Growth", title: "Population growth per minute" },
  { key: "slots", label: "Slots", title: "Open build slots" }
];

const count = (value: number): string => Math.round(value).toLocaleString("en-US");

const growth = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
};

export const townsBannerHtml = (rows: readonly TownListRow[]): string =>
  `<span class="v2s-meta"><b>${rows.length}</b> town${rows.length === 1 ? "" : "s"}</span>`;

/** `focus`, when given, adds the Focus column and the "Set every town" bar (client-hud-v2-towns-focus.ts). */
export const townsBodyHtml = (rows: readonly TownListRow[], sort: TownListSort, focus?: TownsFocusView): string => {
  if (rows.length === 0) return `<div class="v2s-empty">No towns yet</div>`;
  const head = COLUMNS.map(({ key, label, title }) => {
    const active = sort.key === key;
    const arrow = active ? (sort.descending ? " ▼" : " ▲") : "";
    return `<button type="button" class="v2l-sort${active ? " v2l-sort-on" : ""}" data-v2-towns-sort="${key}" title="${title}" aria-pressed="${active}">${label}${arrow}</button>`;
  }).join("");
  const body = rows.map((row) => {
    const warning = townRowWarning(row);
    const note = warning ?? row.plotsNote;
    const previewing = focus?.byKey.get(`${row.x},${row.y}`)?.selected !== undefined;
    const rowHtml = `<button type="button" class="v2l-row${warning ? " v2l-unfed" : ""}${previewing ? " v2l-previewing" : ""}" data-v2-towns-open="${row.x},${row.y}">
      <span class="v2l-name"><span class="v2l-label">${esc(row.name)}</span><small>${esc(row.tierLabel)}${note ? ` · ${esc(note)}` : ""}</small></span>
      <span class="v2l-num">${formatTownCoinPerDay(row)}</span>
      <span class="v2l-num">${row.garrisoned ? `${count(row.manpowerPerRefill)}<small>/refill</small>` : "—"}</span>
      <span class="v2l-num">${count(row.population)}<small>/ ${count(row.maxPopulation)}</small></span>
      <span class="v2l-num">${growth(row.growthPerMinute)}<small>/min</small></span>
      <span class="v2l-num" title="Open build slots">${formatOpenSlots(row.openSlots)}</span>
    </button>`;
    const key = `${row.x},${row.y}`;
    return focus ? `<div class="v2l-item">${rowHtml}${townsFocusCellHtml(key, focus.byKey.get(key), focus.lockForMs)}</div>` : rowHtml;
  }).join("");
  const headHtml = `<div class="v2l-head"><span>Town</span>${head}</div>`;
  return focus
    ? `<section class="v2l-table v2l-with-focus" data-v2-scroll="towns">${townsFocusBarHtml(focus, rows.length)}<div class="v2l-item v2l-item-head">${headHtml}<span class="v2lf-head" title="Each town's focus: tap an icon to switch it now, free">Focus</span></div>${body}</section>`
    : `<section class="v2l-table" data-v2-scroll="towns">${headHtml}${body}</section>`;
};
