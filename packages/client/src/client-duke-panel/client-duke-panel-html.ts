// The Duke panel frame: one view at a time (planet, Court or Log), opened by pressing a planet or the Court/Log buttons.
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

export const dukePanelHtml = (status: DukeStatus, o: PanelViewOptions): string => {
  let title = "The Court";
  let body: string;
  if (o.tab === "COURT") body = dukeCourtHtml(status, o.now);
  else if (o.tab === "LOG") {
    title = "Log";
    body = dukeLogHtml(status, o.now);
  } else {
    const selected = status.systems.find((s) => s.seasonId === o.seasonId) ?? status.systems[0];
    const pills =
      status.systems.length > 1
        ? `<div class="dk-pills">${status.systems
            .map((s) => `<button type="button" class="dk-pill${s.seasonId === selected?.seasonId ? " dk-pill-on" : ""}" data-duke-select-system="${escapeHtml(s.seasonId)}">${escapeHtml(s.label)}</button>`)
            .join("")}</div>`
        : "";
    title = selected ? `Planet · ${selected.label}` : "Planet";
    body = selected ? `${pills}${dukeSystemHtml(status, selected, { now: o.now, targets: o.targets, selectedShip: o.selectedShip })}` : `<p class="dk-note">You hold no planet.</p>`;
  }
  return `<h3 class="dk-title" data-duke-title>${escapeHtml(title)}</h3><p class="dk-message" data-duke-message hidden></p>${body}`;
};
