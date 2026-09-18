// Stage instrumentation shared between the worldgen-lab worker (producer) and
// main.ts (consumer) so the "Generating…" status can show which phase is
// running and, after the fact, which phase actually took the longest.

export type StageKey =
  | "terrain"
  | "clusters"
  | "docks"
  | "towns"
  | "wonders"
  | "spawnSites"
  | "rivers"
  | "finalize";

export const STAGE_ORDER: StageKey[] = [
  "terrain",
  "clusters",
  "docks",
  "towns",
  "wonders",
  "spawnSites",
  "rivers",
  "finalize"
];

export const STAGE_LABELS: Record<StageKey, string> = {
  terrain: "Terrain generation",
  clusters: "Resource clusters",
  docks: "Docks",
  towns: "Towns",
  wonders: "Natural wonders",
  spawnSites: "Fair spawn sites",
  rivers: "Rivers",
  finalize: "Finalizing"
};

// Posted by the worker as each stage starts. `attempt`/`totalAttempts` are
// only present for "terrain", where continents-mode seed refinement can loop
// up to MAX_REFINE_ATTEMPTS times — the one stage with real sub-progress.
export type ProgressMessage = {
  kind: "progress";
  stage: StageKey;
  attempt?: number;
  totalAttempts?: number;
};

export type StageTiming = { stage: StageKey; ms: number };

// Measures wall-clock time actually spent in each stage (not an estimate),
// so the post-run breakdown reflects what really happened on this seed/style.
export const createStageTracker = (post: (message: ProgressMessage) => void) => {
  let stageStart = performance.now();
  const timings: StageTiming[] = [];

  return {
    start(stage: StageKey, extra?: { attempt: number; totalAttempts: number }): void {
      post({ kind: "progress", stage, ...extra });
    },
    finish(stage: StageKey): void {
      const now = performance.now();
      timings.push({ stage, ms: now - stageStart });
      stageStart = now;
    },
    timings
  };
};
