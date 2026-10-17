/** Preserve the visible report, rather than a pixel offset that changes when new rows arrive. */
export type MusterScrollAnchor = { flagKey: string; reportId: string; offset: number };
export const captureMusterScrollAnchor = (body: HTMLElement | null): MusterScrollAnchor | undefined => {
  if (!body || body.scrollTop <= 0) return undefined;
  const section = body.querySelector<HTMLElement>("[data-muster-reports-flag]");
  const flagKey = section?.dataset.musterReportsFlag;
  if (!flagKey) return undefined;
  const top = body.getBoundingClientRect().top;
  const row = Array.from(body.querySelectorAll<HTMLElement>("[data-muster-report-row]")).find((item) => item.getBoundingClientRect().bottom > top);
  const reportId = row?.dataset.musterReportRow;
  return row && reportId ? { flagKey, reportId, offset: row.getBoundingClientRect().top - top } : undefined;
};
export const restoreMusterScrollAnchor = (body: HTMLElement, anchor: MusterScrollAnchor | undefined): void => {
  if (!anchor || body.querySelector<HTMLElement>("[data-muster-reports-flag]")?.dataset.musterReportsFlag !== anchor.flagKey) return;
  const row = Array.from(body.querySelectorAll<HTMLElement>("[data-muster-report-row]")).find((item) => item.dataset.musterReportRow === anchor.reportId);
  if (row) body.scrollTop += row.getBoundingClientRect().top - body.getBoundingClientRect().top - anchor.offset;
};
