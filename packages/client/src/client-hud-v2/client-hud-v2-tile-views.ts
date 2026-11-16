// Tile views with no bar-sized form -- an AFC's Modules, a muster flag's Attack commitment and Combat
// reports -- drawn in the right-hand sidebar Build ▸ and Aether ▸ use (a full sheet on a phone). They used
// to expand the whole legacy tile menu docked on the right (2026-11-16 playtest: "Reports" showed the old UI).
// The markup and wiring are the legacy tabs' own, so both UIs behave the same.

import { afcModulePickerState, bindAfcModulePicker, fitAfcModulePicker, afcModuleTabHtml } from "../client-afc-module-tab/client-afc-module-tab.js";
import { musterReportsHtml, openMusterReportIds, restoreOpenMusterReports, wireMusterReports } from "../client-muster-combat-reports/client-muster-combat-reports-ui.js";
import { musterCommitCardHtml, unsavedMusterCommitValue, wireMusterCommitCard } from "../client-muster-commit-tab/client-muster-commit-card.js";
import type { ClientState } from "../client-state/client-state.js";
import { tileActionButtonHtml } from "../client-tile-menu-html.js";
import type { TileMenuView } from "../client-types.js";
import { buildPanelCloseHtml } from "./client-hud-v2-build-list.js";

export const TILE_VIEW_PANELS = ["modules", "commit", "reports"] as const;
export type TileViewPanel = (typeof TILE_VIEW_PANELS)[number];

export const TILE_VIEW_TITLE: Record<TileViewPanel, string> = {
  modules: "Modules",
  commit: "Attack commitment",
  reports: "Combat reports"
};

export const isTileViewPanel = (panel: string | undefined): panel is TileViewPanel =>
  (TILE_VIEW_PANELS as readonly string[]).includes(panel ?? "");

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const bodyHtml = (panel: TileViewPanel, view: TileMenuView): string => {
  if (panel === "commit") return musterCommitCardHtml(view.commit, "hud-v2-muster-commit");
  if (panel === "reports") return musterReportsHtml(view.musterReports);
  return view.modules ? afcModuleTabHtml(view.modules, tileActionButtonHtml) : `<div class="tile-menu-empty">No modules here.</div>`;
};

export const tileViewPanelHtml = (panel: TileViewPanel, view: TileMenuView, focusLabel: string): string =>
  `<div class="v2t-build-head"><span class="v2t-build-title">${TILE_VIEW_TITLE[panel]}</span><span class="v2t-focus v2t-focus-on">${esc(focusLabel)}</span>${buildPanelCloseHtml(panel)}</div>
    <div class="v2t-build-list hud-v2-tile-view" data-v2-scroll="tile-view-${panel}" data-tile-menu-scroll>${bodyHtml(panel, view)}</div>`;

/** What a repaint of the same tile's view must keep: an unsaved commitment, opened reports, the open socket picker. */
export type TileViewKeep = {
  commitValue: string | undefined;
  openReports: string[];
  picker: ReturnType<typeof afcModulePickerState>;
  /** The list's scroll: an incoming module's countdown repaints the sheet every tick, and reports grow. */
  scrollTop: number;
};

export const keepTileView = (side: HTMLElement): TileViewKeep => ({
  commitValue: unsavedMusterCommitValue(side),
  openReports: openMusterReportIds(side),
  picker: afcModulePickerState(side),
  scrollTop: side.querySelector<HTMLElement>(".hud-v2-tile-view")?.scrollTop ?? 0
});

export type TileViewWiring = {
  state: ClientState;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
};

/** Binds the freshly written view; `keep` is set when the sidebar was already showing this tile's view. */
export const wireTileView = (side: HTMLElement, panel: TileViewPanel, view: TileMenuView, wiring: TileViewWiring, keep?: TileViewKeep): void => {
  if (panel === "commit") wireMusterCommitCard(side, { state: wiring.state, sendGameMessage: wiring.sendGameMessage, restoreValue: keep?.commitValue });
  if (panel === "reports") {
    restoreOpenMusterReports(side, keep?.openReports ?? []);
    wireMusterReports(side, wiring.state, view.musterReports, wiring.renderHud);
  }
  if (panel === "modules") {
    bindAfcModulePicker(side, keep?.picker);
    fitAfcModulePicker(side);
  }
  const list = side.querySelector<HTMLElement>(".hud-v2-tile-view");
  if (list && keep?.scrollTop) list.scrollTop = keep.scrollTop;
};
