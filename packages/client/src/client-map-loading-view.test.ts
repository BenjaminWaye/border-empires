import { describe, expect, it } from "vitest";

import { buildMapLoadingView } from "./client-map-loading-view.js";

describe("buildMapLoadingView", () => {
  it("surfaces retryable server-starting state instead of generic chunk loading copy", () => {
    const view = buildMapLoadingView(
      {
        connection: "disconnected",
        firstChunkAt: 0,
        mapLoadStartedAt: 0,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: true,
        authBusyTitle: "Securing session",
        authBusyDetail: "The game server is still starting. Retrying sign-in shortly..."
      },
      "ws://localhost:3001/ws",
      1_000
    );

    expect(view).toEqual({
      title: "Securing session",
      meta: "The game server is still starting. Retrying sign-in shortly...",
      showRetry: true,
      showReload: true,
      tone: "warn"
    });
  });

  it("keeps generic nearby-land loading copy for healthy initialized bootstrap", () => {
    const view = buildMapLoadingView(
      {
        connection: "initialized",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 2,
        authSessionReady: true,
        authRetrying: false,
        authBusyTitle: "",
        authBusyDetail: ""
      },
      "ws://localhost:3001/ws",
      3_501
    );

    expect(view.title).toBe("Loading nearby land...");
    expect(view.meta).toBe("Elapsed 3.5s · chunks 2");
    expect(view.showRetry).toBe(false);
    expect(view.showReload).toBe(false);
  });

  it("surfaces a stalled no-chunk init as a retryable outage instead of indefinite chunk loading", () => {
    const view = buildMapLoadingView(
      {
        connection: "initialized",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 0,
        authSessionReady: true,
        authRetrying: false,
        authBusyTitle: "",
        authBusyDetail: ""
      },
      "ws://localhost:3001/ws",
      9_500
    );

    expect(view).toEqual({
      title: "Map sync stalled",
      meta: "Your session initialized, but nearby land has not arrived from the server. Retry now or reload the client.",
      showRetry: true,
      showReload: true,
      tone: "warn"
    });
  });
});
