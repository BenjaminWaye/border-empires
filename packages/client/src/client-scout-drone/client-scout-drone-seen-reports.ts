// Which scout reports this page has shown. Whether the player has seen a report lives on the player on the
// server (scoutLastReport, cleared by SCOUT_REPORT_SEEN from whichever device showed it: players switch between
// desktop and phone, owner 2026-11-21). This page-only list just stops a resend that arrives before the server
// has heard (a reconnect, the gateway's replay) from popping the same card up again.

const MAX_IDS = 20;
let shown: string[] = [];

export const scoutReportShownHere = (id: string): boolean => shown.includes(id);

export const noteScoutReportShownHere = (id: string): void => {
  shown = [...shown.filter((seen) => seen !== id), id].slice(-MAX_IDS);
};

/** Tests: a fresh page. */
export const resetScoutReportsShownHere = (): void => {
  shown = [];
};
