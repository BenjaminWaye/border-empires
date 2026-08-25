// Pure HTML builder for a settled own-town's overview stat grid — pulled
// out of client-tile-menu-view.ts's flat prose-line list so Population,
// Gold, and Manpower (the numbers that change what you do next) read as a
// scannable dashboard instead of a paragraph, while Support/Food (usually
// just "full") drop into a compact row below instead of full-size cards.
// Kept presentation-only and unit-testable: every number is precomputed by
// the caller, this module only knows how to lay them out.

export type TownStatGridInput = {
  population: number;
  maxPopulation: number;
  // Population threshold for the next growth tier, e.g. CITY_POPULATION_MIN
  // (see nextTownGrowthUpgrade in town-growth.ts). Undefined once the town
  // is already at METROPOLIS — the top tier has no "next" to progress toward,
  // so the meter falls back to population/maxPopulation.
  nextTierPopulation?: number;
  populationTierLabel: string;
  growthText: string;
  growthTone: "positive" | "warn" | "neutral";
  goldPerDayLabel: string;
  manpowerCapLabel: string;
  manpowerRegenLabel: string;
  // Omitted entirely for SETTLEMENT-tier towns (no support ring / no FOOD
  // slot demand — townFoodSlotDemandForTier("SETTLEMENT") is 0).
  support?: { current: number; max: number };
  food?: { satisfied: number; demand: number; fed: boolean };
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const townStatGridHtml = (input: TownStatGridInput): string => {
  const populationTarget = input.nextTierPopulation ?? input.maxPopulation;
  const tierReached = input.nextTierPopulation !== undefined && input.population >= input.nextTierPopulation;
  const populationPct = populationTarget > 0 ? Math.max(0, Math.min(100, (input.population / populationTarget) * 100)) : 0;
  const miniRow: string[] = [];
  if (input.support) {
    miniRow.push(
      `<div class="tile-stat-mini"><span class="tile-stat-mini-label">Support</span><span class="tile-stat-mini-value">${input.support.current} / ${input.support.max}</span></div>`
    );
  }
  if (input.food) {
    const foodTone = input.food.fed ? "" : " is-attn";
    miniRow.push(
      `<div class="tile-stat-mini"><span class="tile-stat-mini-label">Food</span><span class="tile-stat-mini-value${foodTone}">${input.food.satisfied} / ${input.food.demand}${input.food.fed ? "" : " — unfed"}</span></div>`
    );
  }
  return (
    `<div class="tile-stat-grid">` +
      `<div class="tile-stat tile-stat-span2">` +
        `<span class="tile-stat-label">Population · ${escapeHtml(input.populationTierLabel)}</span>` +
        `<span class="tile-stat-value">${input.population.toLocaleString()}<span class="tile-stat-unit">/ ${populationTarget.toLocaleString()}</span></span>` +
        `<div class="tile-stat-meter"><span${tierReached ? ` class="is-tier-ready"` : ""} style="width:${populationPct.toFixed(1)}%"></span></div>` +
        `<span class="tile-stat-sub is-${input.growthTone}">${escapeHtml(input.growthText)}</span>` +
      `</div>` +
      `<div class="tile-stat tile-stat-span2">` +
        `<span class="tile-stat-label">Gold production</span>` +
        `<span class="tile-stat-value">${escapeHtml(input.goldPerDayLabel)}<span class="tile-stat-unit">/ day</span></span>` +
      `</div>` +
      `<div class="tile-stat tile-stat-span2">` +
        `<span class="tile-stat-label">Manpower contribution</span>` +
        `<span class="tile-stat-value">${escapeHtml(input.manpowerCapLabel)}<span class="tile-stat-unit">cap</span></span>` +
        `<span class="tile-stat-sub">${escapeHtml(input.manpowerRegenLabel)}</span>` +
      `</div>` +
    `</div>` +
    (miniRow.length > 0 ? `<div class="tile-stat-mini-row">${miniRow.join("")}</div>` : "")
  );
};
