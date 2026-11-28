import { MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { formatHoursMinutes } from "../client-manpower-gauge/client-manpower-refill.js";

/**
 * The manpower panel's headline (when the next batch lands) and its
 * collapsible "how manpower works" explainer. The HUD rewrites the panel's
 * innerHTML on every render, so the explainer's open/closed state lives here
 * and is re-applied as the `open` attribute each time.
 */
let manpowerInfoOpen = false;

export const setManpowerInfoOpen = (open: boolean): void => {
  manpowerInfoOpen = open;
};

/**
 * Big "+N in 0h 19m" callout; degrades to "Reserve · batch in 0h 19m adds nothing" / "Full" / "Regen paused". Empty before the player id is known.
 * Over the cap is legitimate: the landing reserve and Waystation grants are paid above it, and no batch lands until the pool drops below.
 */
export const manpowerNextBatchHtml = (args: {
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  nextBatchAmount?: number | undefined;
  nextRefillAtMs: number | undefined;
  nowMs?: number;
}): string => {
  const callout = (label: string, value: string, tone: string): string =>
    `<div class="manpower-next-batch manpower-next-batch-${tone}"><span class="manpower-next-batch-label">${label}</span><strong class="manpower-next-batch-value">${value}</strong></div>`;
  // At or over the cap the batch still comes on the same schedule, it just adds nothing: say when, so this panel
  // agrees with the Chronicle's "next batch in 3m" (first-15 playtest 2026-11-28).
  const skipped = (state: string): string =>
    args.nextRefillAtMs === undefined ? state : `${state} · batch in ${formatHoursMinutes(args.nextRefillAtMs - (args.nowMs ?? Date.now()))} adds nothing`;
  if (args.manpower > args.manpowerCap) return callout(skipped("Reserve"), `+${Math.floor(args.manpower - args.manpowerCap).toLocaleString("en-US")}`, "full");
  if (args.manpower >= args.manpowerCap) return callout(skipped("Manpower"), "Full", "full");
  if (!(args.manpowerRegenPerMinute > 0) && !(args.nextBatchAmount && args.nextBatchAmount > 0)) return callout("Regeneration", "Paused", "paused");
  if (args.nextRefillAtMs === undefined) return "";
  const label = args.nextBatchAmount === undefined ? "Next batch in" : `+${Math.round(Math.max(0, Math.min(args.manpowerCap - args.manpower, args.nextBatchAmount)))} in`;
  return callout(label, formatHoursMinutes(args.nextRefillAtMs - (args.nowMs ?? Date.now())), "pending");
};

/** `nextRefillAtMs`: this player's next batch, so "every 4 hours" and the countdowns elsewhere read as one schedule. */
export const manpowerInfoHtml = (nextRefillAtMs?: number, nowMs: number = Date.now()): string => `
  <details class="manpower-info" data-manpower-info${manpowerInfoOpen ? " open" : ""}>
    <summary class="manpower-info-toggle"><span class="manpower-info-icon" aria-hidden="true">?</span>How manpower works</summary>
    <div class="economy-footnote manpower-info-body">Manpower pays for every claim, garrison, build and attack. Regeneration is paid out as one batch every ${MANPOWER_REFILL_WINDOW_MS / 3_600_000} hours${nextRefillAtMs === undefined ? "" : ` (your next: in ${formatHoursMinutes(nextRefillAtMs - nowMs)})`} rather than ticking up. Fed towns raise cap and regeneration. Recently captured towns contribute less until they stabilize. Your landing reserve and Waystation grants can take you over the cap; no batch is paid until you spend below it. New capacity, such as a town you take, is added to your manpower at once, even over the cap.</div>
  </details>
`;
