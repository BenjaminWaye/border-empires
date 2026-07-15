import { describe, expect, it, vi } from "vitest";
import {
  buildServerStartingErrorPayload,
  createSimBacklogStatusPoller,
  isBacklogDegraded,
  parseSimWriterQueueDepth
} from "./sim-backlog-status.js";

describe("parseSimWriterQueueDepth", () => {
  it("parses the gauge value out of a full Prometheus metrics blob", () => {
    const text = [
      "# HELP sim_ai_queue_backlog_ms ...",
      "# TYPE sim_ai_queue_backlog_ms gauge",
      "sim_ai_queue_backlog_ms 12",
      "# TYPE sim_writer_queue_depth gauge",
      "sim_writer_queue_depth 4411",
      "# TYPE sim_command_accept_latency_ms gauge"
    ].join("\n");
    expect(parseSimWriterQueueDepth(text)).toBe(4411);
  });

  it("returns undefined when the metric is absent", () => {
    expect(parseSimWriterQueueDepth("sim_ai_queue_backlog_ms 0\n")).toBeUndefined();
  });

  it("returns undefined for malformed metrics text", () => {
    expect(parseSimWriterQueueDepth("")).toBeUndefined();
  });
});

describe("isBacklogDegraded", () => {
  it("is false below the threshold", () => {
    expect(isBacklogDegraded(499, 500)).toBe(false);
  });

  it("is true at or above the threshold", () => {
    expect(isBacklogDegraded(500, 500)).toBe(true);
    expect(isBacklogDegraded(4411, 500)).toBe(true);
  });

  it("is false when pending count is unknown", () => {
    expect(isBacklogDegraded(undefined, 500)).toBe(false);
  });
});

describe("buildServerStartingErrorPayload", () => {
  it("uses the generic message when not backlog-degraded", () => {
    const payload = buildServerStartingErrorPayload({});
    expect(payload).toEqual({
      type: "ERROR",
      code: "SERVER_STARTING",
      message: "Realtime simulation is temporarily unavailable. Retry shortly."
    });
  });

  it("uses the backlog-specific message and flags backlogDegraded when degraded", () => {
    const payload = buildServerStartingErrorPayload({ backlogDegraded: true, backlogPendingCount: 4411 });
    expect(payload.backlogDegraded).toBe(true);
    expect(payload.message).toContain("replaying a backlog");
  });
});

describe("createSimBacklogStatusPoller", () => {
  it("updates the target with the parsed pending count and degraded flag on start", async () => {
    const target: { backlogPendingCount?: number; backlogDegraded?: boolean } = {};
    const poller = createSimBacklogStatusPoller({
      getSimMetrics: async () => "sim_writer_queue_depth 600\n",
      target,
      threshold: 500,
      intervalMs: 100_000
    });
    poller.start();
    await vi.waitFor(() => expect(target.backlogPendingCount).toBe(600));
    expect(target.backlogDegraded).toBe(true);
    poller.stop();
  });

  it("keeps the last known value when a scrape succeeds but the gauge is absent from the text", async () => {
    const target: { backlogPendingCount?: number; backlogDegraded?: boolean } = {};
    let call = 0;
    const poller = createSimBacklogStatusPoller({
      getSimMetrics: async () => {
        call += 1;
        // First scrape has the gauge; second (e.g. sim mid-boot, gauge not
        // registered yet) succeeds but omits it entirely.
        return call === 1 ? "sim_writer_queue_depth 600\n" : "sim_ai_queue_backlog_ms 0\n";
      },
      target,
      threshold: 500,
      intervalMs: 10
    });
    poller.start();
    await vi.waitFor(() => expect(target.backlogPendingCount).toBe(600));
    await vi.waitFor(() => expect(call).toBeGreaterThanOrEqual(2));
    expect(target.backlogPendingCount).toBe(600);
    expect(target.backlogDegraded).toBe(true);
    poller.stop();
  });

  it("keeps the last known value when a scrape fails instead of clearing it", async () => {
    const target: { backlogPendingCount?: number; backlogDegraded?: boolean } = {};
    let call = 0;
    const onError = vi.fn();
    const poller = createSimBacklogStatusPoller({
      getSimMetrics: async () => {
        call += 1;
        if (call === 1) return "sim_writer_queue_depth 600\n";
        throw new Error("scrape failed");
      },
      target,
      threshold: 500,
      intervalMs: 10,
      onError
    });
    poller.start();
    await vi.waitFor(() => expect(target.backlogPendingCount).toBe(600));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(target.backlogPendingCount).toBe(600);
    expect(target.backlogDegraded).toBe(true);
    poller.stop();
  });

  it("does nothing until start() is called, and stop() halts further polls", async () => {
    const target: { backlogPendingCount?: number; backlogDegraded?: boolean } = {};
    const getSimMetrics = vi.fn(async () => "sim_writer_queue_depth 1\n");
    const poller = createSimBacklogStatusPoller({ getSimMetrics, target, intervalMs: 10 });
    expect(getSimMetrics).not.toHaveBeenCalled();
    poller.start();
    await vi.waitFor(() => expect(getSimMetrics).toHaveBeenCalled());
    poller.stop();
    const callsAtStop = getSimMetrics.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getSimMetrics.mock.calls.length).toBe(callsAtStop);
  });
});
