import { describe, expect, it } from "vitest";
import { alignServerDeadlines, createServerClock } from "./client-server-clock.js";

// Real prod trace (2026-10-26): phone clock 43.6s fast, EXPAND claim 7.5s,
// ACTION_ACCEPTED arrived ~50ms after send.
const SKEW_MS = 43_600;
const CLAIM_MS = 7_500;
const COMBAT_RESULT_GRACE_MS = 5_000; // client-runtime-loop combat-result-timeout

describe("server clock alignment", () => {
  it("keeps an accepted EXPAND from timing out on a fast device clock", () => {
    const clock = createServerClock();
    const serverNow = 1_793_003_484_339 - CLAIM_MS;
    const receivedAt = serverNow + SKEW_MS + 50;
    const msg = alignServerDeadlines(
      { type: "ACTION_ACCEPTED", resolvesAt: serverNow + CLAIM_MS, serverNow },
      clock,
      receivedAt
    );
    const resolvesAt = msg.resolvesAt as number;
    // Without alignment resolvesAt + 5s is already ~31s in the past here.
    expect(receivedAt > serverNow + CLAIM_MS + COMBAT_RESULT_GRACE_MS).toBe(true);
    expect(receivedAt > resolvesAt + COMBAT_RESULT_GRACE_MS).toBe(false);
    expect(resolvesAt - receivedAt).toBeGreaterThan(CLAIM_MS - 100);
    expect(resolvesAt - receivedAt).toBeLessThanOrEqual(CLAIM_MS);
  });

  it("uses the lowest-latency sample and converts transitEndsAt too", () => {
    const clock = createServerClock();
    clock.observe(1_000, 1_000 + SKEW_MS + 400);
    clock.observe(2_000, 2_000 + SKEW_MS + 20);
    clock.observe(3_000, 3_000 + SKEW_MS + 900);
    expect(clock.offsetMs()).toBe(-(SKEW_MS + 20));
    const msg = alignServerDeadlines({ serverNow: 4_000, resolvesAt: 10_000, transitEndsAt: 6_000 }, clock, 4_000 + SKEW_MS + 20);
    expect(msg.resolvesAt).toBe(10_000 + SKEW_MS + 20);
    expect(msg.transitEndsAt).toBe(6_000 + SKEW_MS + 20);
  });

  it("follows the device clock once it is corrected", () => {
    const clock = createServerClock();
    clock.observe(0, -SKEW_MS); // device was slow
    for (let i = 1; i <= 16; i += 1) clock.observe(i * 1_000, i * 1_000 + 30);
    expect(clock.offsetMs()).toBe(-30);
  });

  it("leaves messages without serverNow untouched", () => {
    const clock = createServerClock();
    const msg = alignServerDeadlines({ type: "ATTACK_ALERT", resolvesAt: 5_000 }, clock, 9_000);
    expect(msg.resolvesAt).toBe(5_000);
    expect(clock.offsetMs()).toBe(0);
  });
});
