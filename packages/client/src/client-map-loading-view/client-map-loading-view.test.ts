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
        authRetryAttempt: 2,
        authRetryNextAt: 4_000,
        authBusyTitle: "Securing session",
        authBusyDetail: "The game server is still starting. Retrying sign-in shortly...",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      1_000
    );

    expect(view).toEqual({
      title: "Securing session",
      meta: "The game server is still starting. Retrying sign-in shortly... Attempt 2 starts in 3s.",
      showRetry: true,
      showReload: true,
      showDiagnostics: true,
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
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "",
        authBusyDetail: "",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      3_501
    );

    expect(view.title).toBe("Loading nearby land...");
    expect(view.meta).toBe("Elapsed 3.5s · chunks 2");
    expect(view.showRetry).toBe(false);
    expect(view.showReload).toBe(false);
    expect(view.showDiagnostics).toBe(false);
  });

  it("does not duplicate retry countdown already present in auth detail", () => {
    const view = buildMapLoadingView(
      {
        connection: "connected",
        firstChunkAt: 0,
        mapLoadStartedAt: 0,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: true,
        authRetryAttempt: 1,
        authRetryNextAt: 4_000,
        authBusyTitle: "Securing session",
        authBusyDetail: "Game server is still starting. Retrying sign-in... Attempt 1 starts in 3s.",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      1_000
    );

    expect(view.meta).toBe("Game server is still starting. Retrying sign-in... Attempt 1 starts in 3s.");
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
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "",
        authBusyDetail: "",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      9_500
    );

    expect(view).toEqual({
      title: "Map sync stalled",
      meta: "Your session initialized, but nearby land has not arrived from the server. Retry now or reload the client.",
      showRetry: true,
      showReload: true,
      showDiagnostics: true,
      tone: "warn"
    });
  });

  it("escalates to a soft hint at ~8s when connected but auth has not landed, offering diagnostics only", () => {
    const view = buildMapLoadingView(
      {
        connection: "connected",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "Securing session",
        authBusyDetail: "",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      9_000
    );

    expect(view.title).toBe("Securing session");
    expect(view.meta).toContain("longer than usual");
    expect(view.tone).toBe("normal");
    expect(view.showRetry).toBe(false);
    expect(view.showReload).toBe(false);
    // Diagnostics appear at the soft-hint threshold itself (not just at the
    // later 25s action-affordance threshold) so a login stuck anywhere in
    // the 8-25s band — the common slow-login shape — can always grab logs.
    expect(view.showDiagnostics).toBe(true);
  });

  it("exposes retry/reload/diagnostics at ~25s when connected but auth still has not landed", () => {
    const view = buildMapLoadingView(
      {
        connection: "connected",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "Securing session",
        authBusyDetail: "",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      26_000
    );

    expect(view.title).toBe("Securing session");
    expect(view.meta).toContain("hasn't acknowledged sign-in in 26.0s");
    expect(view.tone).toBe("warn");
    expect(view.showRetry).toBe(true);
    expect(view.showReload).toBe(true);
    expect(view.showDiagnostics).toBe(true);
  });

  it("surfaces authBusyDetail as meta when server sends LOGIN_PHASE during normal loading", () => {
    const view = buildMapLoadingView(
      {
        connection: "connected",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "Syncing empire...",
        authBusyDetail: "Exporting your territory — almost there.",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      3_000
    );

    expect(view.title).toBe("Syncing empire...");
    expect(view.meta).toBe("Exporting your territory — almost there.");
    expect(view.tone).toBe("normal");
    expect(view.showRetry).toBe(false);
  });

  it("does not escalate before the soft-hint threshold even on a slow start", () => {
    const view = buildMapLoadingView(
      {
        connection: "connected",
        firstChunkAt: 0,
        mapLoadStartedAt: 1,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "",
        authBusyDetail: "",
        serverDeploying: false
      },
      "ws://localhost:3001/ws",
      7_500
    );

    expect(view.title).toBe("Syncing empire...");
    expect(view.tone).toBe("normal");
    expect(view.showRetry).toBe(false);
    expect(view.showDiagnostics).toBe(false);
  });

  it("shows calm deployment message when disconnected and serverDeploying is true", () => {
    const view = buildMapLoadingView(
      {
        connection: "disconnected",
        firstChunkAt: 0,
        mapLoadStartedAt: 0,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "",
        authBusyDetail: "",
        serverDeploying: true
      },
      "ws://localhost:3001/ws",
      1_000
    );

    expect(view.title).toBe("Server update in progress");
    expect(view.meta).toContain("1–2 minutes");
    expect(view.tone).toBe("normal");
    expect(view.showRetry).toBe(false);
    expect(view.showReload).toBe(false);
    expect(view.showDiagnostics).toBe(false);
  });

  it("shows calm reconnecting message when connecting and serverDeploying is true", () => {
    const view = buildMapLoadingView(
      {
        connection: "connecting",
        firstChunkAt: 0,
        mapLoadStartedAt: 0,
        chunkFullCount: 0,
        authSessionReady: false,
        authRetrying: false,
        authRetryAttempt: 0,
        authRetryNextAt: 0,
        authBusyTitle: "",
        authBusyDetail: "",
        serverDeploying: true
      },
      "ws://localhost:3001/ws",
      1_000
    );

    expect(view.title).toBe("Reconnecting after update...");
    expect(view.tone).toBe("normal");
    expect(view.showRetry).toBe(false);
    expect(view.showReload).toBe(false);
    expect(view.showDiagnostics).toBe(false);
  });
});
