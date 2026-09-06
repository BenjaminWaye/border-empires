// Descriptive LOGIN_PHASE progress text for the live_subscribe and finalize
// stretches of the AUTH handler (gateway-app.ts). Split out to keep that file
// from growing further past its line limit.

export type LoginPhaseMessage = { title: string; detail: string };

export const computeLiveSubscribeMessage = (elapsedMs: number): LoginPhaseMessage =>
  elapsedMs < 3_000
    ? { title: "Syncing empire...", detail: "Connecting your empire to the simulation." }
    : elapsedMs < 8_000
      ? { title: "Syncing empire...", detail: "Exporting your territory — almost there." }
      : elapsedMs < 20_000
        ? { title: "Syncing empire...", detail: `Building snapshot for a large empire (${Math.round(elapsedMs / 1000)}s)…` }
        : { title: "Syncing empire...", detail: `Large empire detected — hang on (${Math.round(elapsedMs / 1000)}s)…` };

export type FinalizeStageTracker = {
  /** Switch to a new real sub-step: notifies immediately and resets the elapsed clock. */
  setStage: (detail: string) => void;
  /** For the heartbeat: current stage's detail, with elapsed seconds appended once it runs long. */
  computeMessage: () => LoginPhaseMessage;
};

export const createFinalizeStageTracker = (
  notify: (title: string, detail: string) => void,
  initialDetail = "Building your world state."
): FinalizeStageTracker => {
  let detail = initialDetail;
  let stageStartedAt = Date.now();
  notify("Finishing up...", initialDetail);
  return {
    setStage: (nextDetail) => {
      detail = nextDetail;
      stageStartedAt = Date.now();
      notify("Finishing up...", nextDetail);
    },
    computeMessage: () => {
      const stageElapsedMs = Date.now() - stageStartedAt;
      return {
        title: "Finishing up...",
        detail: stageElapsedMs < 3_000 ? detail : `${detail} (${Math.round(stageElapsedMs / 1000)}s)…`
      };
    }
  };
};
