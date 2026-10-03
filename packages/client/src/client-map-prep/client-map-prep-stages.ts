// Stages of building the 3D map after login, in order. Each is announced on
// the login overlay (with a paint) before its main-thread-blocking work runs.
export const MAP_PREP_STAGES = ["graphics", "terrain", "structures", "shaders", "firstFrame"] as const;
export type MapPrepStage = (typeof MAP_PREP_STAGES)[number];

export const MAP_PREP_STAGE_LABELS: Readonly<Record<MapPrepStage, string>> = {
  graphics: "Setting up graphics...",
  terrain: "Shaping the land...",
  structures: "Placing towns and structures...",
  shaders: "Preparing shaders...",
  firstFrame: "Drawing your map..."
};

export type MapPrepState = {
  stage: MapPrepStage;
  /** Index of `stage` in MAP_PREP_STAGES. */
  index: number;
  startedAt: number;
  stageStartedAt: number;
};
