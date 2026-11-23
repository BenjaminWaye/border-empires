// The Chronicle's Ahead tab: the end-of-visit forecast (docs/visit-as-a-turn.md §2.4). Yours says what
// happened; Ahead says what is still to come and when it is worth coming back. It is a tab of its own so the
// forecast gets the whole sheet on a phone instead of a strip above the timeline.

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

export const aheadTabHtml = (forecast: VisitForecast): string => {
  const rows = forecast.items.length > 0
    ? `<div class="v2c-day">WHILE YOU ARE AWAY</div>${forecast.items.map(rowHtml).join("")}`
    : `<div class="v2s-empty">Nothing is underway. Queue a build or an expansion before you go, and it will be here.</div>`;
  return `<div class="v2c-list v2c-ahead" data-v2-scroll="chronicle-ahead">${aheadReturnHtml(forecast)}${rows}</div>`;
};
