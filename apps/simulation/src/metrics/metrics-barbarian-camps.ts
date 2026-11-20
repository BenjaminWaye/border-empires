import { clampMetric } from "./metrics-format.js";

/** Planetary Defense camp gauges and counters (planetary-defense-camps/camp-runtime.ts sizes()). */
export type BarbarianCampMetricsSnapshot = {
  simBarbarianTiles: number;
  simBarbarianCamps: number;
  simBarbarianAwakeCamps: number;
  simBarbarianDirtyCamps: number;
  simBarbarianCampAwakeDriftTotal: number;
  simBarbarianCampTilesReleasedTotal: number;
};

export type BarbarianCampStats = { tiles: number; camps: number; awakeCamps: number; dirtyCamps: number; awakeDriftTotal: number; releasedTotal: number };

// Fixed scalars sampled from the bounded camp index; no per-camp labels.
export const createBarbarianCampMetrics = () => {
  let snapshot: BarbarianCampMetricsSnapshot = {
    simBarbarianTiles: 0,
    simBarbarianCamps: 0,
    simBarbarianAwakeCamps: 0,
    simBarbarianDirtyCamps: 0,
    simBarbarianCampAwakeDriftTotal: 0,
    simBarbarianCampTilesReleasedTotal: 0
  };
  return {
    set: (stats: BarbarianCampStats): void => {
      snapshot = {
        simBarbarianTiles: clampMetric(stats.tiles),
        simBarbarianCamps: clampMetric(stats.camps),
        simBarbarianAwakeCamps: clampMetric(stats.awakeCamps),
        simBarbarianDirtyCamps: clampMetric(stats.dirtyCamps),
        simBarbarianCampAwakeDriftTotal: clampMetric(stats.awakeDriftTotal),
        simBarbarianCampTilesReleasedTotal: clampMetric(stats.releasedTotal)
      };
    },
    snapshot: (): BarbarianCampMetricsSnapshot => snapshot
  };
};
