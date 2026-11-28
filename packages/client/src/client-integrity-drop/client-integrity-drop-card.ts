// The Integrity panel's "Why it fell" card: the one place the drop gets a
// short explanation (what Integrity is, the cause, the fix), with buttons to
// look at the spot and, for a garrison shortfall, to start Garrison Many on
// the nearest frontier tile. Bound in client-hud-weak-defensibility-toggle.ts.

import type { IntegrityDropNotice } from "./client-integrity-drop-cause.js";

const INTEGRITY_WHAT = "Integrity: how compact and garrisoned your land is. It scales income and growth.";

export const integrityDropCardHtml = (notice: IntegrityDropNotice | undefined): string => {
  if (!notice) return "";
  const focus = notice.focus
    ? `<button class="panel-btn defense-weak-tile-go" type="button" data-weak-def-focus="${notice.focus.x},${notice.focus.y}">Show (${notice.focus.x}, ${notice.focus.y})</button>`
    : "";
  const garrison = notice.kind === "garrison"
    ? `<button class="panel-btn defense-weak-tile-go" type="button" data-integrity-garrison-many="true">Garrison Many</button>`
    : "";
  return `<article class="card defense-breakdown-card defense-drop-card" data-integrity-drop-card="true">
    <div class="defense-kicker">Why it fell · ${notice.fromPct}% → ${notice.toPct}%</div>
    <p class="defense-copy">${INTEGRITY_WHAT}</p>
    <div class="defense-line"><span>Cause</span><strong class="is-negative">${notice.cause}</strong></div>
    <div class="defense-line"><span>Fix</span><strong>${notice.fix}</strong></div>
    ${focus || garrison ? `<div class="defense-drop-actions">${focus}${garrison}</div>` : ""}
  </article>`;
};
