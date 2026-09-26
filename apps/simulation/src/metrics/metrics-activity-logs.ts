import { clampMetric } from "./metrics-format.js";

export type ActivityLogMetricsSnapshot = {
  simTerritoryFlipLogEntries: number;
  simCombatManpowerLogEntries: number;
  simPersonalImpactLogEntries: number;
  simPersonalImpactLogCapHitsTotal: number;
};

// Fixed scalars sampled from bounded logs. This keeps no player labels, log
// records, or history, so instrumentation cannot grow with activity volume.
export const createActivityLogMetrics = () => {
  let simTerritoryFlipLogEntries = 0;
  let simCombatManpowerLogEntries = 0;
  let simPersonalImpactLogEntries = 0;
  let simPersonalImpactLogCapHitsTotal = 0;

  return {
    set: (stats: { territoryFlipEntries: number; combatManpowerEntries: number; personalImpactEntries: number; personalImpactCapHits: number }): void => {
      simTerritoryFlipLogEntries = clampMetric(stats.territoryFlipEntries);
      simCombatManpowerLogEntries = clampMetric(stats.combatManpowerEntries);
      simPersonalImpactLogEntries = clampMetric(stats.personalImpactEntries);
      simPersonalImpactLogCapHitsTotal = clampMetric(stats.personalImpactCapHits);
    },
    snapshot: (): ActivityLogMetricsSnapshot => ({
      simTerritoryFlipLogEntries,
      simCombatManpowerLogEntries,
      simPersonalImpactLogEntries,
      simPersonalImpactLogCapHitsTotal
    })
  };
};
