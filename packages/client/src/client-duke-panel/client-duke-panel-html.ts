// The Duke panel frame: three tabs (planet, Court, Log) around their content.
import { dukeCourtHtml, dukeLogHtml } from "./client-duke-court-html.js";
import { escapeHtml } from "./client-duke-escape.js";
import { dukeSystemHtml } from "./client-duke-system-html.js";
import type { DukePanelTab, DukeShipKind, DukeStatus, DukeTargetOption } from "./client-duke-types.js";

export type PanelViewOptions = {
  now: number;
  tab: DukePanelTab;
  seasonId: string | null;
  targets: ReadonlyArray<DukeTargetOption>;
  selectedShip: DukeShipKind | null;
};

const TABS: ReadonlyArray<{ id: DukePanelTab; label: string }> = [
  { id: "SYSTEM", label: "Planet" },
  { id: "COURT", label: "Court" },
  { id: "LOG", label: "Log" }
];

export const dukePanelHtml = (status: DukeStatus, o: PanelViewOptions): string => {
  const badge = (tab: DukePanelTab): string =>
    tab === "COURT" && (status.court.offer.status === "PENDING" || status.attention.some((a) => a.kind === "PETITION_READY")) ? `<i class="dk-dot" aria-label="needs attention"></i>` : "";
  const tabs = `<nav class="dk-tabs" role="tablist">${TABS.map(
    (t) => `<button type="button" role="tab" class="dk-tab${t.id === o.tab ? " dk-tab-on" : ""}" aria-selected="${t.id === o.tab}" data-duke-tab="${t.id}">${t.label}${badge(t.id)}</button>`
  ).join("")}</nav>`;

  let body: string;
  if (o.tab === "COURT") body = dukeCourtHtml(status, o.now);
  else if (o.tab === "LOG") body = dukeLogHtml(status, o.now);
  else {
    const selected = status.systems.find((s) => s.seasonId === o.seasonId) ?? status.systems[0];
    const pills =
      status.systems.length > 1
        ? `<div class="dk-pills">${status.systems
            .map((s) => `<button type="button" class="dk-pill${s.seasonId === selected?.seasonId ? " dk-pill-on" : ""}" data-duke-select-system="${escapeHtml(s.seasonId)}">${escapeHtml(s.label)}</button>`)
            .join("")}</div>`
        : "";
    body = selected ? `${pills}${dukeSystemHtml(status, selected, { now: o.now, targets: o.targets, selectedShip: o.selectedShip })}` : `<p class="dk-note">You hold no planet.</p>`;
  }
  return `${tabs}<p class="dk-message" data-duke-message hidden></p>${body}`;
};
