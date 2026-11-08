import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, lastManpowerRefillAtMs, nextManpowerRefillAtMs } from "@border-empires/shared";
import { orbHtml, orbInputForState, orbOverflowFraction, orbLiquidStyle, type OrbState } from "./client-hud-v2-orb.js";

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

  it("explains overflow without presenting the cap as a maximum holding", () => {
    const html = orbHtml({ ...base, manpower: 6000 });
    expect(html).not.toContain(">Above capacity<");
    expect(html).toContain('class="hud-v2-orb-overflow"');
    expect(html).not.toContain("<pattern");
    expect(html).not.toContain('hud-v2-orb-excess-ring');
    expect(html).not.toContain(">+378<");
    expect(html).toContain(">Capacity 5,622<");
    expect(html).toContain("above capacity");
    expect(orbHtml({ ...base, manpower: 5622 })).not.toContain("Above capacity");
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

describe("overfilled liquid", () => {
  it("grows proportionally with the surplus rather than drawing the same border at every overflow level", () => {
    expect(orbOverflowFraction(50, 100)).toBe(0);
    expect(orbOverflowFraction(100, 100)).toBe(0);
    expect(orbOverflowFraction(125, 100)).toBeCloseTo(0.2);
    expect(orbOverflowFraction(200, 100)).toBeCloseTo(0.5);
    expect(orbOverflowFraction(2720, 150)).toBeCloseTo(2570 / 2720);
    expect(orbHtml({ ...base, manpower: 200, manpowerCap: 100 })).toContain('class="hud-v2-orb-surface"');
  });

  it("shows carried manpower even when normal capacity is zero", () => {
    expect(orbOverflowFraction(25, 0)).toBe(1);
    expect(orbOverflowFraction(0, 0)).toBe(0);
    expect(orbHtml({ ...base, manpower: 25, manpowerCap: 0 })).not.toContain("hud-v2-orb-empty");
    expect(orbHtml({ ...base, manpower: 0, manpowerCap: 0 })).toContain("hud-v2-orb-empty");
  });
});

it("only bubbles above capacity, with bounded intensity and the original liquid colour", () => {
  const count = (manpower: number): number => (orbHtml({ ...base, manpower, manpowerCap: 100 }).match(/class="hud-v2-orb-bubble"/g) ?? []).length;
  expect(count(40)).toBe(0);
  expect(count(100)).toBe(0);
  expect(count(125)).toBe(3);
  expect(count(200)).toBe(4);
  expect(count(1000000)).toBe(6);
  expect(orbHtml({ ...base, manpower: 200, manpowerCap: 100 })).not.toContain("hud-v2-orb-overflow-lip");
  expect(orbHtml({ ...base, manpower: 200, manpowerCap: 100, color: "#3dd1ce" })).toContain('class="hud-v2-orb-overflow"' + orbLiquidStyle("#3dd1ce"));
});

it("fills the entire glass at capacity and above, without a wave-shaped air gap", () => {
  const fullGlass = 'd="M0 0 H180 V180 H0 Z"';
  expect(orbHtml({ ...base, manpower: 100, manpowerCap: 100 })).toContain(fullGlass);
  expect(orbHtml({ ...base, manpower: 125, manpowerCap: 100 })).toContain(fullGlass);
  expect(orbHtml({ ...base, manpower: 40, manpowerCap: 100 })).not.toContain(fullGlass);
});
