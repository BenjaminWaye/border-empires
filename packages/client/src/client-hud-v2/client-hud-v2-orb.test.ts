import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, lastManpowerRefillAtMs, nextManpowerRefillAtMs } from "@border-empires/shared";
import { orbHtml, orbInputForState, type OrbState } from "./client-hud-v2-orb.js";

const MIN = 60_000;
const base = { manpower: 1975, manpowerCap: 5622, nextRefillAt: 45 * MIN, nowMs: 0 };

describe("manpower orb next batch", () => {
  it("shows how much the next batch brings, clamped to the room under the cap", () => {
    expect(orbHtml({ ...base, nextBatchAmount: 1200 })).toContain(">+1,200 in 45m<");
    expect(orbHtml({ ...base, manpower: 5000, nextBatchAmount: 1200 })).toContain(">+622 in 45m<");
    expect(orbHtml({ ...base, nextBatchAmount: 1200.9 })).toContain(">+1,200 in 45m<");
    expect(orbHtml({ ...base, nextBatchAmount: -50 })).toContain(">next batch 45m<");
    expect(orbHtml({ ...base, manpower: 6000, nextBatchAmount: 1200 })).not.toContain("hud-v2-orb-refill");
  });

  it("formats the tooltip like the visible text", () => {
    expect(orbHtml({ ...base, nextBatchAmount: 1200 })).toContain('title="Manpower 1975 of 5622, next batch +1,200 in 45m"');
    expect(orbHtml({ ...base })).toContain('title="Manpower 1975 of 5622, next batch in 45m"');
  });

  it("says paused when regen is zero and no batch is coming, instead of counting down to nothing", () => {
    expect(orbHtml({ ...base, nextBatchAmount: 0, regenPerMinute: 0 })).toContain(">paused<");
    expect(orbHtml({ ...base, nextBatchAmount: 300, regenPerMinute: 0 })).toContain(">+300 in 45m<");
  });
});

describe("orbInputForState", () => {
  const me = "player-1";
  const windowStart = lastManpowerRefillAtMs(me, 10 * MANPOWER_REFILL_WINDOW_MS);
  const state = (receivedAt: number | undefined): OrbState => ({
    me, manpower: 1975, manpowerCap: 5622, manpowerRegenPerMinute: 5, nextManpowerBatchAmount: 1200, nextManpowerBatchAmountAt: receivedAt
  });

  // Regression: renderFast passed no batch amount, so the orb only ever said "refill 45m".
  it("wires the server's batch amount and the local countdown into the orb", () => {
    const nowMs = windowStart + 10 * MIN;
    const input = orbInputForState(state(windowStart + MIN), nowMs, "#3f7fd0");
    expect(input).toMatchObject({ nextBatchAmount: 1200, regenPerMinute: 5, nextRefillAt: nextManpowerRefillAtMs(me, nowMs), color: "#3f7fd0" });
    expect(orbHtml(input)).toContain(">+1,200 in ");
  });

  it("drops the amount once the refill it described has passed", () => {
    const nowMs = windowStart + MANPOWER_REFILL_WINDOW_MS + MIN;
    expect(orbInputForState(state(windowStart + MIN), nowMs, undefined).nextBatchAmount).toBeUndefined();
    expect(orbInputForState(state(undefined), nowMs, undefined).nextBatchAmount).toBeUndefined();
  });
});
