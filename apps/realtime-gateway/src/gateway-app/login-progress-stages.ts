// Client-visible login progress for the AUTH handler (gateway-app.ts):
// descriptive LOGIN_PHASE text for the live_subscribe and finalize stretches,
// and chunked INIT delivery so the client can show a download progress bar.
// Split out to keep that file from growing further past its line limit.
import { encodeInitChunkFrames, INIT_CHUNKING_MIN_CHARS } from "@border-empires/shared";

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

type InitPayloadSocket = { send: (data: string) => void };

/**
 * Sends the serialized INIT. Clients that advertised `initChunking` get large
 * payloads as chunk frames (see shared init-transfer.ts) so they can report
 * download progress; everyone else gets the single frame they always did.
 * Returns the number of frames sent.
 */
export const sendInitPayload = (socket: InitPayloadSocket, initJson: string, clientSupportsChunking: boolean): number => {
  if (!clientSupportsChunking || initJson.length <= INIT_CHUNKING_MIN_CHARS) {
    socket.send(initJson);
    return 1;
  }
  const frames = encodeInitChunkFrames(initJson);
  for (const frame of frames) socket.send(frame);
  return frames.length;
};
