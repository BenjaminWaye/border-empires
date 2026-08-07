// Extracted from metrics.ts (which sits at the repo's 500-line file cap) to make
// room for new metrics without growing that file past the cap. Each of these
// counters fires only when the corresponding experiment flag is set (see
// SIMULATION_AI_DRY_RUN etc. in simulation-service.ts) — zero means the guard
// never engaged, per the "emit a counter on every skip/cap" project rule.
export const createAiExperimentCounters = () => {
  let simAiDryRunSkippedTotal = 0;
  let simAiCommandCapSkippedTotal = 0;
  let simAiExpandDisabledTotal = 0;
  let simAiBuildDisabledTotal = 0;

  return {
    snapshot: () => ({
      simAiDryRunSkippedTotal,
      simAiCommandCapSkippedTotal,
      simAiExpandDisabledTotal,
      simAiBuildDisabledTotal
    }),
    incrementSimAiDryRunSkipped(): void {
      simAiDryRunSkippedTotal += 1;
    },
    incrementSimAiCommandCapSkipped(): void {
      simAiCommandCapSkippedTotal += 1;
    },
    incrementSimAiExpandDisabled(): void {
      simAiExpandDisabledTotal += 1;
    },
    incrementSimAiBuildDisabled(): void {
      simAiBuildDisabledTotal += 1;
    }
  };
};

export type AiExperimentCounters = ReturnType<typeof createAiExperimentCounters>;
