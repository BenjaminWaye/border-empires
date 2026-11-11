import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSeasonVictoryRecheckTimer, SEASON_VICTORY_RECHECK_MAX_DELAY_MS } from "./season-victory-recheck-timer.js";

type Status = "active" | "pending" | "ended";

describe("season victory recheck timer", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  const setup = (initial: { status: Status; scheduledStartAt?: number }) => {
    let seasonState = initial;
    const onFire = vi.fn();
    const timer = createSeasonVictoryRecheckTimer({ getSeasonState: () => seasonState, onFire });
    return { timer, onFire, setSeasonState: (next: typeof initial) => { seasonState = next; } };
  };

  it("fires at the contested objective's due time", () => {
    const { timer, onFire } = setup({ status: "active" });
    timer.schedule(Date.now() + 10_000);
    vi.advanceTimersByTime(9_999);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("caps the delay at the 5-minute fallback", () => {
    const { timer, onFire } = setup({ status: "active" });
    timer.schedule(undefined);
    vi.advanceTimersByTime(SEASON_VICTORY_RECHECK_MAX_DELAY_MS - 1);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("uses the pending season's start time when nothing is contested", () => {
    const { timer, onFire } = setup({ status: "pending", scheduledStartAt: Date.now() + 2_000 });
    timer.schedule(undefined);
    vi.advanceTimersByTime(2_000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does not arm for an ended season, and rescheduling replaces the pending timer", () => {
    const { timer, onFire, setSeasonState } = setup({ status: "active" });
    timer.schedule(Date.now() + 1_000);
    setSeasonState({ status: "ended" });
    timer.schedule(Date.now() + 1_000);
    vi.advanceTimersByTime(SEASON_VICTORY_RECHECK_MAX_DELAY_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("clear cancels the pending recheck", () => {
    const { timer, onFire } = setup({ status: "active" });
    timer.schedule(Date.now() + 1_000);
    timer.clear();
    vi.advanceTimersByTime(SEASON_VICTORY_RECHECK_MAX_DELAY_MS);
    expect(onFire).not.toHaveBeenCalled();
  });
});
