export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );

export const missingHistoryNotice = (
  section: "deadliest-tile" | "longest-road" | "timeline",
  record: string,
  message: string
): string => `
  <div class="se-missing-history">
    <p id="se-missing-${section}">${escapeHtml(message)}</p>
    <button type="button" class="se-missing-history-report" aria-describedby="se-missing-${section}"
      aria-label="Report a bug for ${escapeHtml(record)}" data-se-report-missing="${section}" data-se-missing-records="${escapeHtml(record)}">Report a bug</button>
  </div>`;
