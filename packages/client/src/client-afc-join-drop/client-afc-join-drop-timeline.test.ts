import { describe, expect, it } from "vitest";
import {
  AFC_JOIN_BRAKE_MS,
  AFC_JOIN_DESCENT_MS,
  AFC_JOIN_REENTRY_MS,
  AFC_JOIN_TOTAL_MS,
  afcJoinBrakeIntensity,
  afcJoinFallenFraction
} from "./client-afc-join-drop-timeline.js";

describe("AFC join drop timeline", () => {
  it("is slow and deliberate: several seconds of descent and a long afterglow", () => {
    expect(AFC_JOIN_DESCENT_MS).toBeGreaterThanOrEqual(5000);
    expect(AFC_JOIN_TOTAL_MS).toBeGreaterThanOrEqual(6000);
  });

  it("runs as long as the 9 s rocket sound that plays when it starts", () => {
    expect(AFC_JOIN_TOTAL_MS).toBe(9000);
  });

  it("falls monotonically from orbit (0) to touchdown (1)", () => {
    expect(afcJoinFallenFraction(0)).toBe(0);
    expect(afcJoinFallenFraction(AFC_JOIN_DESCENT_MS)).toBe(1);
    let previous = 0;
    for (let age = 0; age <= AFC_JOIN_DESCENT_MS; age += 50) {
      const f = afcJoinFallenFraction(age);
      expect(f).toBeGreaterThanOrEqual(previous);
      previous = f;
    }
  });

  it("brakes to a standstill: speed at touchdown is ~0 and never spikes above the re-entry seam speed", () => {
    const speed = (age: number): number => (afcJoinFallenFraction(age + 1) - afcJoinFallenFraction(age)) * 1000;
    expect(speed(AFC_JOIN_DESCENT_MS - 2)).toBeLessThan(0.001);
    const seamSpeed = speed(AFC_JOIN_REENTRY_MS - 1);
    for (let age = AFC_JOIN_REENTRY_MS; age < AFC_JOIN_DESCENT_MS; age += 25) expect(speed(age)).toBeLessThanOrEqual(seamSpeed + 1e-6);
  });

  it("has continuous velocity across the re-entry/braking seam", () => {
    const speed = (age: number): number => afcJoinFallenFraction(age + 1) - afcJoinFallenFraction(age);
    expect(Math.abs(speed(AFC_JOIN_REENTRY_MS - 1) - speed(AFC_JOIN_REENTRY_MS))).toBeLessThan(2e-5);
  });

  it("lights the braking burn only around the braking window", () => {
    expect(afcJoinBrakeIntensity(0)).toBe(0);
    expect(afcJoinBrakeIntensity(AFC_JOIN_REENTRY_MS - 500)).toBe(0);
    expect(afcJoinBrakeIntensity(AFC_JOIN_REENTRY_MS + 200)).toBeGreaterThan(0.5);
    expect(afcJoinBrakeIntensity(AFC_JOIN_REENTRY_MS + AFC_JOIN_BRAKE_MS - 10)).toBeLessThan(afcJoinBrakeIntensity(AFC_JOIN_REENTRY_MS + 200));
    expect(afcJoinBrakeIntensity(AFC_JOIN_DESCENT_MS)).toBe(0);
  });
});
