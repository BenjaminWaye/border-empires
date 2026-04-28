import type { ClientState } from "./client-state.js";

export type MapLoadingView = {
  title: string;
  meta: string;
  showRetry: boolean;
  showReload: boolean;
  tone: "normal" | "warn";
};

export const buildMapLoadingView = (
  state: Pick<
    ClientState,
    "connection" | "firstChunkAt" | "mapLoadStartedAt" | "chunkFullCount" | "authSessionReady" | "authRetrying" | "authBusyTitle" | "authBusyDetail"
  >,
  wsUrl: string,
  now: number = Date.now()
): MapLoadingView => {
  const startAt = state.mapLoadStartedAt || now;
  const elapsedMs = Math.max(0, now - startAt);
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  if (state.connection === "disconnected") {
    if (state.authRetrying) {
      return {
        title: state.authBusyTitle || "Realtime simulation unavailable",
        meta: state.authBusyDetail || "The server is unavailable. Retry sign-in or reload the client.",
        showRetry: true,
        showReload: true,
        tone: "warn"
      };
    }
    return {
      title: "Disconnected from server",
      meta: "Retrying connection...",
      showRetry: false,
      showReload: false,
      tone: "normal"
    };
  }
  if (state.connection === "connecting") {
    return {
      title: "Connecting to server...",
      meta: "Retrying connection...",
      showRetry: false,
      showReload: false,
      tone: "normal"
    };
  }
  if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
    if (!state.authSessionReady && state.authRetrying) {
      return {
        title: state.authBusyTitle || "Securing session",
        meta: state.authBusyDetail || "Waiting for the realtime server to become available.",
        showRetry: true,
        showReload: true,
        tone: "warn"
      };
    }
    if (state.connection === "initialized" && state.authSessionReady && state.firstChunkAt === 0 && elapsedMs >= 8_000) {
      return {
        title: "Map sync stalled",
        meta: "Your session initialized, but nearby land has not arrived from the server. Retry now or reload the client.",
        showRetry: true,
        showReload: true,
        tone: "warn"
      };
    }
    return {
      title: state.authSessionReady ? "Loading nearby land..." : "Syncing empire...",
      meta: state.authSessionReady ? `Elapsed ${elapsedSeconds}s · chunks ${state.chunkFullCount}` : `Connected to ${wsUrl}`,
      showRetry: false,
      showReload: false,
      tone: "normal"
    };
  }
  return {
    title: "Loading world...",
    meta: "Finalizing map render...",
    showRetry: false,
    showReload: false,
    tone: "normal"
  };
};
