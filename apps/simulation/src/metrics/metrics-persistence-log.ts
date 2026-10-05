import { clampMetric } from "./metrics-format.js";

export type PersistenceLogMetricsSnapshot = {
  simInMemoryPersistenceCommands: number;
  simInMemoryPersistenceEvents: number;
  simInMemoryPersistenceEvictedTotal: number;
};

// Fixed scalars sampled from InMemorySimulationPersistence.stats(): the log is
// bounded (PR #2230), so a held-size gauge that climbs past ~125% of the cap, or
// an evicted counter that stays 0 under load, means the bound stopped working.
export const createPersistenceLogMetrics = () => {
  let simInMemoryPersistenceCommands = 0;
  let simInMemoryPersistenceEvents = 0;
  let simInMemoryPersistenceEvictedTotal = 0;

  return {
    set: (stats: { commandsHeld: number; eventsHeld: number; evictedTotal: number }): void => {
      simInMemoryPersistenceCommands = clampMetric(stats.commandsHeld);
      simInMemoryPersistenceEvents = clampMetric(stats.eventsHeld);
      simInMemoryPersistenceEvictedTotal = clampMetric(stats.evictedTotal);
    },
    snapshot: (): PersistenceLogMetricsSnapshot => ({
      simInMemoryPersistenceCommands,
      simInMemoryPersistenceEvents,
      simInMemoryPersistenceEvictedTotal
    })
  };
};
