import { markLoginTimeline } from "../client-init-transfer/client-login-timeline.js";
import { yieldToPaint } from "../client-init-transfer/client-init-transfer-yield.js";
import { formatTimeLeft } from "../client-init-transfer/client-init-transfer-progress.js";
import { readStageEstimates, recordStageDuration } from "./client-map-prep-estimate.js";
import { MAP_PREP_STAGE_LABELS, MAP_PREP_STAGES, type MapPrepStage, type MapPrepState } from "./client-map-prep-stages.js";

// Drives the login overlay through the 3D map build (client-map-3d.ts calls
// `onStage` between its heavy steps). Each stage is shown and painted before
// its work blocks the main thread, so the player sees which step is running,
// "Step k of N", and a per-device time estimate instead of a frozen screen.

export type MapPrep = {
  /** Announces a stage and resolves once it has been painted. */
  readonly onStage: (stage: MapPrepStage) => Promise<void>;
  /** Ends the prep (map drawn, or 3D failed/retired) and hides the prep view. */
  readonly finish: () => void;
};

type MapPrepHostState = { mapPrep: MapPrepState | null };

export const createMapPrep = (deps: {
  readonly state: MapPrepHostState;
  readonly render: () => void;
  readonly now?: () => number;
  readonly waitForPaint?: () => Promise<void>;
}): MapPrep => {
  const now = deps.now ?? Date.now;
  const waitForPaint = deps.waitForPaint ?? (() => new Promise<void>((resolve) => yieldToPaint(resolve)));

  const closeCurrentStage = (at: number): void => {
    const current = deps.state.mapPrep;
    if (current) recordStageDuration(current.stage, at - current.stageStartedAt);
  };

  return {
    onStage: async (stage) => {
      const at = now();
      closeCurrentStage(at);
      const startedAt = deps.state.mapPrep?.startedAt ?? at;
      deps.state.mapPrep = { stage, index: MAP_PREP_STAGES.indexOf(stage), startedAt, stageStartedAt: at };
      markLoginTimeline(`prep:${stage}`);
      deps.render();
      await waitForPaint();
    },
    finish: () => {
      if (!deps.state.mapPrep) return;
      closeCurrentStage(now());
      deps.state.mapPrep = null;
      markLoginTimeline("mapReady");
      deps.render();
    }
  };
};

export type MapPrepView = { title: string; detail: string; percent: number };

export const describeMapPrep = (
  prep: MapPrepState,
  nowMs: number,
  estimates: Readonly<Record<MapPrepStage, number>> = readStageEstimates()
): MapPrepView => {
  const total = MAP_PREP_STAGES.length;
  const elapsedInStage = Math.max(0, nowMs - prep.stageStartedAt);
  let remainingMs = Math.max(0, estimates[prep.stage] - elapsedInStage);
  for (const stage of MAP_PREP_STAGES.slice(prep.index + 1)) remainingMs += estimates[stage];
  return {
    title: MAP_PREP_STAGE_LABELS[prep.stage],
    detail: `Step ${prep.index + 1} of ${total}. ${formatTimeLeft(remainingMs)}`,
    percent: Math.round((prep.index / total) * 100)
  };
};
