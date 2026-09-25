import type { InitTransferProgress, RealtimeSocket } from "../client-socket-types.js";

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
  ws.addEventListener("close", () => {
    state.initTransfer = null;
  });
};

export type InitTransferView = {
  title: string;
  detail: string;
  /** 0–100, for the progress bar. */
  percent: number;
};

const formatKb = (chars: number): string => `${Math.max(1, Math.round(chars / 1024)).toLocaleString("en-US")} KB`;

export const describeInitTransfer = (progress: InitTransferProgress): InitTransferView => {
  const total = Math.max(1, progress.totalChars);
  const percent = Math.min(100, Math.max(0, Math.round((progress.receivedChars / total) * 100)));
  if (progress.phase === "building") {
    return {
      title: "Building your map...",
      detail: "World downloaded. Laying out your territory — this can take a few seconds on phones.",
      percent: 100
    };
  }
  return {
    title: "Downloading your world...",
    detail: `${formatKb(progress.receivedChars)} of ${formatKb(progress.totalChars)} received.`,
    percent
  };
};
