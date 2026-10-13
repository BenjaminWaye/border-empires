// Empire Integrity's home in the Economy panel: a summary card next to the
// resource cards that opens the full breakdown (the "defensibility" panel,
// via data-defensibility-open). It moved here from the top toolbar, which now
// only shows an integrity chip once integrity costs coin/growth (see
// client-stat-chips.ts's integrityChipHtml).

import { EMPIRE_INTEGRITY_ENABLED, INTEGRITY_PENALTY_PCT, integrityEconomyMult, integrityGrowthMult } from "@border-empires/shared";

const signedPct = (mult: number): string => {
  const pct = Math.round((mult - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

export const economyIntegrityCardHtml = (integrityPct: number, rateToneClass: (value: number) => string): string => {
  const pct = Math.max(0, Math.min(100, Math.round(integrityPct)));
  const t = pct / 100;
  const effect = EMPIRE_INTEGRITY_ENABLED
    ? `<span class="economy-rate ${rateToneClass(pct - INTEGRITY_PENALTY_PCT)}">${signedPct(integrityEconomyMult(t))} coin &middot; ${signedPct(integrityGrowthMult(t))} growth</span>`
    : "<span>Compact borders defend better</span>";
  return `<button class="economy-summary-card economy-summary-card-integrity" type="button" data-defensibility-open="true" title="Compact empires with fewer exposed sides earn an income and growth bonus. Tap for a breakdown.">
    <div class="economy-summary-head"><strong>Empire Integrity</strong></div>
    <div class="economy-summary-stock">${pct}%</div>
    <div class="economy-summary-rates">${effect}</div>
  </button>`;
};
