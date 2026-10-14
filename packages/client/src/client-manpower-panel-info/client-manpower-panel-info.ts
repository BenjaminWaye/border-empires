import { MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { formatRefillCountdown } from "../client-manpower-gauge/client-manpower-refill.js";

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

/** Big "Next batch in 2h 19m" callout; degrades to "Manpower full" / "Regen paused". Empty before the player id is known. */
export const manpowerNextBatchHtml = (args: {
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  nextRefillAtMs: number | undefined;
  nowMs?: number;
}): string => {
  const callout = (label: string, value: string, tone: string): string =>
    `<div class="manpower-next-batch manpower-next-batch-${tone}"><span class="manpower-next-batch-label">${label}</span><strong class="manpower-next-batch-value">${value}</strong></div>`;
  if (args.manpower >= args.manpowerCap) return callout("Manpower", "Full", "full");
  if (!(args.manpowerRegenPerMinute > 0)) return callout("Regeneration", "Paused", "paused");
  if (args.nextRefillAtMs === undefined) return "";
  return callout("Next batch in", formatRefillCountdown(args.nextRefillAtMs - (args.nowMs ?? Date.now())), "pending");
};

export const manpowerInfoHtml = (): string => `
  <details class="manpower-info" data-manpower-info${manpowerInfoOpen ? " open" : ""}>
    <summary class="manpower-info-toggle" aria-label="How manpower works"><span class="manpower-info-icon" aria-hidden="true">?</span>How manpower works</summary>
    <div class="economy-footnote manpower-info-body">Manpower gates attacks. Regeneration is paid out as one batch every ${MANPOWER_REFILL_WINDOW_MS / 3_600_000} hours rather than ticking up. Fed towns raise cap and regeneration. Recently captured towns contribute less until they stabilize.</div>
  </details>
`;
