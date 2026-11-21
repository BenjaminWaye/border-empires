// The last scout drone landing report, kept on the player record (`scoutLastReport`) until the player has
// seen it on any device. A drone that landed while its owner was away (logged off, the game in the background,
// a socket not yet known dead) sent its report to nobody (player report 2026-11-21: logging back in after a run
// showed no report). The report now rides along on every SCOUT_DRONE resend until the client says it showed
// it (SCOUT_REPORT_SEEN), so it appears on whichever device the player opens next, and never again after that,
// whether they switch between desktop and phone or not. Saved with the player like the charges, so a restart
// keeps it too (runtime-snapshot-sections.ts, runtime-hydration.ts, runtime-state-export.ts).
import type { DomainPlayer } from "@border-empires/game-domain";
import type { ScoutHeldReport } from "@border-empires/shared";

/** Past this, an unseen report stops riding along: the Activity log card is enough. */
export const SCOUT_HELD_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type HeldPlayer = Pick<DomainPlayer, "scoutLastReport">;

/** Keeps the landing report on the player, replacing the last one. */
export const holdScoutReport = (player: HeldPlayer | undefined, report: ScoutHeldReport): void => {
  if (player) player.scoutLastReport = report;
};

/** The player's report they haven't seen yet, if still fresh; one past its day is dropped (`expired`). */
export const unseenScoutReport = (player: HeldPlayer | undefined, nowMs: number, expired: () => void): ScoutHeldReport | undefined => {
  const report = player?.scoutLastReport;
  if (!player || !report) return undefined;
  if (nowMs - report.landedAt < SCOUT_HELD_REPORT_MAX_AGE_MS) return report;
  delete player.scoutLastReport;
  expired();
  return undefined;
};

/** SCOUT_REPORT_SEEN: clears the report when `id` names it. True when it did (a stale or repeated id is a no-op). */
export const markScoutReportSeen = (player: HeldPlayer | undefined, id: unknown): boolean => {
  if (!player?.scoutLastReport || typeof id !== "string" || player.scoutLastReport.id !== id) return false;
  delete player.scoutLastReport;
  return true;
};
