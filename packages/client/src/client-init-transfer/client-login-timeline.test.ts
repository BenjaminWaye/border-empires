import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLoginTimeline,
  finishLoginTimeline,
  lastLoginTimelineSummary,
  markLoginTimeline,
  parseIncomingMessage,
  snapshotActiveLoginTimeline,
  TIMED_PARSE_MIN_CHARS
} from "./client-login-timeline.js";

describe("login timeline", () => {
  afterEach(() => {
    finishLoginTimeline("test-cleanup");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records marks, large parses and a summary for the diagnostics bundle", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    beginLoginTimeline({ initChars: 500_000 });
    markLoginTimeline("downloadComplete");
    const big = JSON.stringify({ type: "INIT", padding: "x".repeat(TIMED_PARSE_MIN_CHARS) });
    expect(parseIncomingMessage(big).type).toBe("INIT");
    expect(parseIncomingMessage('{"type":"PING"}').type).toBe("PING");
    markLoginTimeline("initDispatchEnd", { heldMessages: 3 });

    const inProgress = snapshotActiveLoginTimeline();
    expect(Object.keys((inProgress?.marks as Record<string, number>) ?? {})).toEqual(["downloadComplete", "initDispatchEnd"]);

    finishLoginTimeline("complete");
    const summary = lastLoginTimelineSummary();
    expect(summary?.outcome).toBe("complete");
    expect(summary?.facts).toMatchObject({ initChars: 500_000, heldMessages: 3 });
    // Only the large message is timed.
    expect(summary?.parses).toEqual([expect.objectContaining({ type: "INIT", chars: big.length })]);
    expect(snapshotActiveLoginTimeline()).toBeNull();
  });

  it("finishes 2s after the map reports ready", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    beginLoginTimeline({ initChars: 1 });
    markLoginTimeline("initDispatchEnd");
    markLoginTimeline("mapReady");
    vi.advanceTimersByTime(1_999);
    expect(snapshotActiveLoginTimeline()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(lastLoginTimelineSummary()?.marks).toHaveProperty("mapReady");
  });

  it("finishes on its own 60s after the INIT handler returns if the map never reports ready", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    beginLoginTimeline({ initChars: 1 });
    markLoginTimeline("initDispatchEnd");
    expect(snapshotActiveLoginTimeline()).not.toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(snapshotActiveLoginTimeline()).toBeNull();
    expect(lastLoginTimelineSummary()?.outcome).toBe("complete");
  });

  it("ignores marks and skips parse timing when no login is being timed", () => {
    markLoginTimeline("initDispatchEnd");
    expect(snapshotActiveLoginTimeline()).toBeNull();
    expect(parseIncomingMessage('{"type":"INIT"}').type).toBe("INIT");
  });
});
