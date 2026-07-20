import { describe, expect, it, vi } from "vitest";

import { createLoginPhaseNotifier, type LoginPhaseSocket } from "./login-phase-notifier.js";

const openSocket: LoginPhaseSocket = { readyState: 1, OPEN: 1 };
const closedSocket: LoginPhaseSocket = { readyState: 3, OPEN: 1 };

describe("createLoginPhaseNotifier", () => {
  it("notify sends a single LOGIN_PHASE message with the given title/detail", () => {
    const sendJson = vi.fn();
    const notifier = createLoginPhaseNotifier(sendJson);

    notifier.notify(openSocket, "Preparing your empire...", "Connecting to the simulation backend.");

    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson).toHaveBeenCalledWith(openSocket, {
      type: "LOGIN_PHASE",
      title: "Preparing your empire...",
      detail: "Connecting to the simulation backend."
    });
  });

  it("startHeartbeat fires on the configured interval, computing elapsed time each tick", () => {
    vi.useFakeTimers();
    try {
      const sendJson = vi.fn();
      const notifier = createLoginPhaseNotifier(sendJson);
      const computeMessage = vi.fn((elapsedMs: number) => ({
        title: "Finishing up...",
        detail: `elapsed=${elapsedMs}`
      }));

      const timer = notifier.startHeartbeat(openSocket, computeMessage, 1_000);
      try {
        expect(sendJson).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1_000);
        expect(sendJson).toHaveBeenCalledTimes(1);
        expect(sendJson).toHaveBeenLastCalledWith(openSocket, {
          type: "LOGIN_PHASE",
          title: "Finishing up...",
          detail: "elapsed=1000"
        });

        vi.advanceTimersByTime(1_000);
        expect(sendJson).toHaveBeenCalledTimes(2);
        expect(sendJson).toHaveBeenLastCalledWith(openSocket, {
          type: "LOGIN_PHASE",
          title: "Finishing up...",
          detail: "elapsed=2000"
        });
      } finally {
        clearInterval(timer);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("startHeartbeat skips sending once the socket is no longer open, but keeps computing nothing extra", () => {
    vi.useFakeTimers();
    try {
      const sendJson = vi.fn();
      const notifier = createLoginPhaseNotifier(sendJson);
      const computeMessage = vi.fn(() => ({ title: "x", detail: "y" }));

      const timer = notifier.startHeartbeat(closedSocket, computeMessage, 500);
      try {
        vi.advanceTimersByTime(2_000);
        expect(sendJson).not.toHaveBeenCalled();
      } finally {
        clearInterval(timer);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
