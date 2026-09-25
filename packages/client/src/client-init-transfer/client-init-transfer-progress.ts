import type { InitTransferProgress, RealtimeSocket } from "../client-socket-types.js";
import { estimateInitBuildMs } from "./client-init-transfer-build-estimate.js";

type InitTransferProgressState = {
  authSessionReady: boolean;
  initTransfer: InitTransferProgress | null;
};

/** Mirrors the socket's chunked-INIT progress into state and re-renders the login overlay. */
export const bindInitTransferProgress = (ws: RealtimeSocket, state: InitTransferProgressState, onChange: () => void): void => {
  ws.addEventListener("initprogress", (event) => {
    if (state.authSessionReady) return;
    state.initTransfer = event.detail;
    onChange();
  });
  // Clear once the transfer is over so a later login on this session (an
  // in-place reconnect dispatches "open" but never "close", or a retried
  // AUTH on the same socket) can't flash the old "Building your map" view.
  // The multiplex socket delivers the reassembled INIT as the first message
  // after the "building" event.
  ws.addEventListener("message", () => {
    if (state.initTransfer?.phase === "building") state.initTransfer = null;
  });
  const clear = (): void => {
    state.initTransfer = null;
  };
  ws.addEventListener("open", clear);
  ws.addEventListener("close", clear);
};

export type InitTransferView = {
  title: string;
  /** What is happening plus how long is left, e.g. "300 KB of 1,000 KB received. About 8s left." */
  detail: string;
  /** 0–100, for the progress bar. */
  percent: number;
  /** Estimated time until the map is up (download + build), or null while still measuring. */
  remainingMs: number | null;
};

// Need a little elapsed time past the first frame before the speed is meaningful.
const MIN_SPEED_SAMPLE_MS = 250;

const formatKb = (chars: number): string => `${Math.max(1, Math.round(chars / 1024)).toLocaleString("en-US")} KB`;

export const formatTimeLeft = (ms: number): string => {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec < 60) return `About ${totalSec}s left.`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return seconds === 0 ? `About ${minutes} min left.` : `About ${minutes} min ${seconds}s left.`;
};

const estimateDownloadRemainingMs = (progress: InitTransferProgress, now: number): number | null => {
  const elapsedMs = now - progress.startedAt;
  const charsSinceFirstFrame = progress.receivedChars - progress.firstFrameChars;
  if (elapsedMs < MIN_SPEED_SAMPLE_MS || charsSinceFirstFrame <= 0) return null;
  return ((progress.totalChars - progress.receivedChars) * elapsedMs) / charsSinceFirstFrame;
};

export const describeInitTransfer = (
  progress: InitTransferProgress,
  now: number = Date.now(),
  buildEstimateMs: number = estimateInitBuildMs(progress.totalChars)
): InitTransferView => {
  if (progress.phase === "building") {
    return {
      title: "Building your map...",
      detail: `World downloaded. Laying out your territory. ${formatTimeLeft(buildEstimateMs)}`,
      percent: 100,
      remainingMs: buildEstimateMs
    };
  }
  const total = Math.max(1, progress.totalChars);
  const percent = Math.min(100, Math.max(0, Math.round((progress.receivedChars / total) * 100)));
  const downloadRemainingMs = estimateDownloadRemainingMs(progress, now);
  const remainingMs = downloadRemainingMs === null ? null : downloadRemainingMs + buildEstimateMs;
  const received = `${formatKb(progress.receivedChars)} of ${formatKb(progress.totalChars)} received.`;
  return {
    title: "Downloading your world...",
    detail: `${received} ${remainingMs === null ? "Estimating time left..." : formatTimeLeft(remainingMs)}`,
    percent,
    remainingMs
  };
};
