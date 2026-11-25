import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeployStatus } from "./client-deploy-countdown.js";
import { createDeployStatusPoller, DEPLOY_STATUS_POLL_MS } from "./client-deploy-status-poller.js";

const NOW = 1_800_000_000_000;

describe("createDeployStatusPoller", () => {
  afterEach(() => vi.useRealTimers());

  const setup = (responses: unknown[]) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const state = { deployStatus: null as DeployStatus | null };
    const fetchStatus = vi.fn(async () => (responses.length > 1 ? responses.shift() : responses[0]));
    const onChange = vi.fn();
    const poller = createDeployStatusPoller({ state, fetchStatus, onChange });
    return { state, fetchStatus, onChange, poller };
  };

  it("fetches on drop, re-fetches every 15s and ticks the countdown each second", async () => {
    const { state, fetchStatus, onChange, poller } = setup([{ state: "deploying", startedAt: NOW - 1_000, expectedSeconds: 90 }]);
    poller.start();
    poller.start(); // idempotent
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(state.deployStatus).toEqual({ startedAt: NOW - 1_000, expectedSeconds: 90 });
    expect(onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(4);
    await vi.advanceTimersByTimeAsync(DEPLOY_STATUS_POLL_MS);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("falls back to plain reconnecting for a missing or stale file", async () => {
    const { state, onChange, poller } = setup([null, { state: "deploying", startedAt: NOW - 20 * 60_000, expectedSeconds: 90 }]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.deployStatus).toBeNull();
    await vi.advanceTimersByTimeAsync(DEPLOY_STATUS_POLL_MS);
    expect(state.deployStatus).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    poller.stop();
  });

  it("clears the countdown when the session is back and ignores a late answer", async () => {
    let resolveLate: (value: unknown) => void = () => undefined;
    const { state, fetchStatus, onChange, poller } = setup([{ state: "deploying", startedAt: NOW, expectedSeconds: 90 }]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.deployStatus).not.toBeNull();
    fetchStatus.mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve; }));
    await vi.advanceTimersByTimeAsync(DEPLOY_STATUS_POLL_MS);
    poller.stop();
    expect(state.deployStatus).toBeNull();
    const callsAtStop = onChange.mock.calls.length;
    resolveLate({ state: "deploying", startedAt: NOW, expectedSeconds: 90 });
    await vi.advanceTimersByTimeAsync(DEPLOY_STATUS_POLL_MS * 2);
    expect(state.deployStatus).toBeNull();
    expect(onChange.mock.calls.length).toBe(callsAtStop);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a fetcher (native wrapper, tests)", () => {
    const state = { deployStatus: null as DeployStatus | null };
    const poller = createDeployStatusPoller({ state, fetchStatus: null, onChange: vi.fn() });
    poller.start();
    poller.stop();
    expect(state.deployStatus).toBeNull();
  });
});
