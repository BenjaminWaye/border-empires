// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTEST_BUILD_SLOW_MS,
  applyContestRolloverReady,
  contestProgressText,
  ensureContestProgressTicker,
  resetContestProgressForTests
} from "./client-next-contest-progress.js";

const committed = () => ({ seasonEndStarting: true, seasonStartVoted: true });

describe("contest start progress", () => {
  beforeEach(() => resetContestProgressForTests());

  it("shows nothing until a start is under way for a committed House", () => {
    expect(contestProgressText({ seasonEndStarting: false, seasonStartVoted: true }, 0)).toBeUndefined();
    expect(contestProgressText({ seasonEndStarting: true, seasonStartVoted: false }, 0)).toBeUndefined();
  });

  it("counts up while the next world is built, and says when it is slow", () => {
    const state = committed();
    expect(contestProgressText(state, 1_000)).toBe("Building the next world · 0:00");
    expect(contestProgressText(state, 24_000)).toBe("Building the next world · 0:23");
    expect(contestProgressText(state, 1_000 + CONTEST_BUILD_SLOW_MS + 2_000)).toBe(
      "Still building the next world · 1:32 · taking longer than usual"
    );
  });

  it("switches to a reconnect countdown once the gateway says the world is ready", () => {
    const state = committed();
    contestProgressText(state, 0);
    applyContestRolloverReady(state, { reconnectInMs: 12_400 }, 30_000);
    expect(contestProgressText(state, 30_000)).toBe("World ready · joining in 13s");
    expect(contestProgressText(state, 42_500)).toBe("World ready · joining…");
  });

  it("forgets the clock when the start is cancelled, so a later start counts from zero", () => {
    const state = committed();
    contestProgressText(state, 0);
    state.seasonEndStarting = false;
    expect(contestProgressText(state, 50_000)).toBeUndefined();
    state.seasonEndStarting = true;
    expect(contestProgressText(state, 60_000)).toBe("Building the next world · 0:00");
  });

  it("ignores a ready notice when no start was announced", () => {
    const state = { seasonEndStarting: false, seasonStartVoted: true };
    applyContestRolloverReady(state, { reconnectInMs: 5_000 }, 0);
    expect(state.seasonEndStarting).toBe(false);
    expect(contestProgressText(state, 0)).toBeUndefined();
  });
});

describe("ensureContestProgressTicker", () => {
  beforeEach(() => {
    resetContestProgressForTests();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("updates the progress line every second while it is on screen", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p data-se-progress></p>`;
    const state = committed();
    ensureContestProgressTicker(root, state);
    const line = root.querySelector("[data-se-progress]");
    expect(line?.textContent).toBe("Building the next world · 0:00");
    vi.advanceTimersByTime(5_000);
    expect(line?.textContent).toBe("Building the next world · 0:05");
    state.seasonEndStarting = false;
    vi.advanceTimersByTime(1_000);
    expect(line?.textContent).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});
