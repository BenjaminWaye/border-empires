// The Chronicle's Ahead tab: the agenda (docs/visit-as-a-turn.md §2.2), then the end-of-visit forecast (§2.4).
// Yours says what happened; Ahead says what is worth deciding now, what is still to come and when it is worth
// coming back. It is a tab of its own so both get the whole sheet on a phone instead of a strip above the timeline.

import type { AgendaItem } from "../client-visit-agenda/client-visit-agenda.js";
import { formatAhead, type ForecastItem, type VisitForecast } from "../client-visit-forecast/client-visit-forecast.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const OPEN_LABEL: Record<string, string> = { ranks: "Ranks", diplomacy: "Diplomacy" };

const rowHtml = (item: ForecastItem): string => {
  const action = item.focus
    ? `<button type="button" class="v2c-show" data-v2-ahead-focus data-x="${item.focus.x}" data-y="${item.focus.y}">Show</button>`
    : item.open
      ? `<button type="button" class="v2c-show" data-hud-v2-open="${esc(item.open)}">${esc(OPEN_LABEL[item.open] ?? "Open")}</button>`
      : "";
  return `<div class="v2c-ahead-row v2c-ahead-${item.kind.replace(/_/g, "-")}"><span class="v2c-ahead-text">${esc(item.text)}</span>${action}</div>`;
};

/** The suggested time to come back, or "" when nothing ahead is far enough away to wait for. */
export const aheadReturnHtml = (forecast: VisitForecast): string =>
  forecast.returnIn
    ? `<div class="v2c-return" role="status"><span class="v2c-return-h">Good moment to come back</span><p class="v2c-return-line">In about <b>${formatAhead(forecast.returnIn.inMs)}</b>, when ${esc(forecast.returnIn.reason)}.</p></div>`
    : "";

const AGENDA_OPEN_LABEL: Record<string, string> = { towns: "Towns", manpower: "Manpower", manifest: "Manifest", afc: "AFC" };

/** One whole-row button per decision: the row itself goes to the place to act. */
const agendaRowHtml = (item: AgendaItem): string => {
  const attr = item.focus
    ? ` data-v2-ahead-focus data-v2-ahead-select data-x="${item.focus.x}" data-y="${item.focus.y}"`
    : item.open ? ` data-hud-v2-open="${esc(item.open)}"` : "";
  const go = item.focus ? "Show" : item.open ? AGENDA_OPEN_LABEL[item.open] ?? "Open" : "";
  return `<button type="button" class="v2c-agenda-row v2c-agenda-${item.kind.replace(/_/g, "-")}"${attr}><span class="v2c-agenda-text"><span class="v2c-agenda-title">${esc(item.title)}</span><span class="v2c-agenda-sub">${esc(item.sub)}</span></span>${go ? `<span class="v2c-agenda-go" aria-hidden="true">${esc(go)} ›</span>` : ""}</button>`;
};

/** "Worth doing now": the ranked decisions, or one quiet line when nothing needs one. */
export const agendaHtml = (agenda: readonly AgendaItem[]): string =>
  `<div class="v2c-day">WORTH DOING NOW</div>${agenda.length > 0 ? agenda.map(agendaRowHtml).join("") : `<div class="v2c-agenda-none">Nothing needs a decision right now.</div>`}`;

export const aheadTabHtml = (forecast: VisitForecast, agenda: readonly AgendaItem[] = []): string => {
  const rows = forecast.items.length > 0
    ? `<div class="v2c-day">WHILE YOU ARE AWAY</div>${forecast.items.map(rowHtml).join("")}`
    : `<div class="v2s-empty">Nothing is underway. Queue a build or an expansion before you go, and it will be here.</div>`;
  return `<div class="v2c-list v2c-ahead" data-v2-scroll="chronicle-ahead">${agendaHtml(agenda)}${aheadReturnHtml(forecast)}${rows}</div>`;
};
