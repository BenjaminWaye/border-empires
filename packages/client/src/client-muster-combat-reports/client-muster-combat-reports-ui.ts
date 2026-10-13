import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { musterCombatReports, markMusterReportsRead, type MusterCombatReport, type ReportState } from "./client-muster-combat-reports.js";

export type MusterReportsView = { flagKey: string; reports: MusterCombatReport[]; unread: number };
export const injectMusterCombatReports = (view: TileMenuView, tile: Tile, state: ReportState): void => {
  if (tile.muster?.ownerId !== state.me) return;
  const flagKey = `${tile.x},${tile.y}`;
  const reports = musterCombatReports(state, flagKey);
  view.musterReports = { flagKey, reports, unread: reports.filter((report) => !report.read).length };
  if (!view.tabs.includes("reports")) view.tabs.push("reports");
};
const amount = (value: number): string => Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
const reportDetailHtml = (detail: string): string => escapeHtml(detail)
  .replace(/Plundered[\s\S]*?(?= Lost |$)/g, '<span class="muster-report-gain">$&</span>')
  .replace(/Lost [\d,.]+ manpower\./g, '<span class="muster-report-loss">$&</span>');
export const musterReportsHtml = (view: MusterReportsView | undefined): string => {
  if (!view?.reports.length) return '<div class="tile-menu-empty">No combat reports yet. This flag’s battles will appear here when they resolve.</div>';
  return `<section class="muster-reports" aria-label="Recent combat" data-muster-reports-flag="${escapeHtml(view.flagKey)}">
    <div class="muster-reports-head"><span>Latest ${view.reports.length} battles</span>${view.unread ? '<button type="button" class="muster-reports-read" data-muster-reports-read>Mark as read</button>' : ''}</div>
    ${view.reports.map((report) => `<article data-muster-report-row="${escapeHtml(report.id)}" class="muster-report${report.read ? '' : ' is-unread'}">
      <div class="muster-report-heading"><strong>${escapeHtml(report.title)}</strong>${report.read ? '' : '<span class="muster-report-badge">New</span>'}</div>
      <div class="muster-report-context">(${report.targetX}, ${report.targetY}) · <time datetime="${new Date(report.at).toISOString()}">${escapeHtml(new Date(report.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time></div>
      <div class="muster-report-values">
        ${report.manpowerDelta < 0 ? `<span class="muster-report-loss">−${amount(report.manpowerDelta)} manpower lost</span>` : report.manpowerDelta > 0 ? `<span class="muster-report-gain">+${amount(report.manpowerDelta)} manpower gained</span>` : '<span>No manpower lost</span>'}
        ${report.coins > 0 ? `<span class="muster-report-gain">+${amount(report.coins)} coins plundered</span>` : ''}
      </div>
      <details data-muster-report-id="${escapeHtml(report.id)}"><summary>Battle details</summary><p>${reportDetailHtml(report.detail)}</p></details>
    </article>`).join('')}
    <p class="muster-reports-foot">Up to 40 reports per flag, saved in this browser for this season.</p>
  </section>`;
};
export const wireMusterReports = (root: ParentNode, state: ReportState, view: MusterReportsView | undefined, rerender: () => void): void => {
  const button = root.querySelector<HTMLButtonElement>("[data-muster-reports-read]");
  if (button && view) button.onclick = () => {
    markMusterReportsRead(state, view.reports.map((report) => report.id));
    rerender();
  };
};


export const openMusterReportIds = (root: ParentNode): string[] =>
  Array.from(root.querySelectorAll<HTMLDetailsElement>("details[data-muster-report-id][open]"), (detail) => detail.dataset.musterReportId ?? "");
export const restoreOpenMusterReports = (root: ParentNode, ids: readonly string[]): void => {
  root.querySelectorAll<HTMLDetailsElement>("details[data-muster-report-id]").forEach((detail) => {
    detail.open = ids.includes(detail.dataset.musterReportId ?? "");
  });
};
