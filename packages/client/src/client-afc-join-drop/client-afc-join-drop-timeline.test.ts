import { describe, expect, it } from "vitest";
import {
  AFC_JOIN_DESCENT_MS,
  AFC_JOIN_ENGINE_CUT_MS,
  AFC_JOIN_FULL_BURN_MS,
  AFC_JOIN_TOTAL_MS,
  afcJoinBrakeIntensity,
  afcJoinFallenFraction,
  afcJoinStreakAlpha
} from "./client-afc-join-drop-timeline.js";

const speed = (age: number): number => (afcJoinFallenFraction(age + 1) - afcJoinFallenFraction(age)) * 1000;

describe("AFC join drop timeline", () => {
  it("follows the rocket clip: full burn, wind-down, engine cut, then touchdown on the 7.15 s impact hit", () => {
    expect(AFC_JOIN_FULL_BURN_MS).toBe(1700);
    expect(AFC_JOIN_ENGINE_CUT_MS).toBe(6350);
    expect(AFC_JOIN_DESCENT_MS).toBe(7150);
    expect(AFC_JOIN_TOTAL_MS).toBeGreaterThanOrEqual(9000);
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

  it("burns the thrusters at full power from the start", () => {
    expect(afcJoinBrakeIntensity(250)).toBe(1);
    expect(afcJoinBrakeIntensity(AFC_JOIN_FULL_BURN_MS - 1)).toBe(1);
  });

  it("winds the thrust down after the full burn, then cuts it at the engine cut", () => {
    let previous = afcJoinBrakeIntensity(AFC_JOIN_FULL_BURN_MS);
    for (let age = AFC_JOIN_FULL_BURN_MS + 50; age < AFC_JOIN_ENGINE_CUT_MS; age += 50) {
      const burn = afcJoinBrakeIntensity(age);
      expect(burn).toBeLessThanOrEqual(previous);
      previous = burn;
    }
    expect(afcJoinBrakeIntensity(AFC_JOIN_ENGINE_CUT_MS - 200)).toBeGreaterThan(0);
    expect(afcJoinBrakeIntensity(AFC_JOIN_ENGINE_CUT_MS - 200)).toBeLessThan(0.45);
    for (let age = AFC_JOIN_ENGINE_CUT_MS; age <= AFC_JOIN_DESCENT_MS; age += 50) expect(afcJoinBrakeIntensity(age)).toBe(0);
  });

  it("brakes while the thrusters burn, nearly hovers at the engine cut, then drops unpowered into the ground", () => {
    let previous = speed(0);
    for (let age = 50; age < AFC_JOIN_ENGINE_CUT_MS - 1; age += 50) {
      const v = speed(age);
      expect(v).toBeLessThanOrEqual(previous);
      previous = v;
    }
    expect(speed(AFC_JOIN_ENGINE_CUT_MS - 2)).toBeLessThan(0.001);
    expect(speed(AFC_JOIN_DESCENT_MS - 2)).toBeGreaterThan(speed(AFC_JOIN_ENGINE_CUT_MS + 50));
  });

  it("fades the re-entry streak in at the start and burns it off once the thrust winds down", () => {
    expect(afcJoinStreakAlpha(0)).toBe(0);
    expect(afcJoinStreakAlpha(1000)).toBe(1);
    expect(afcJoinStreakAlpha(AFC_JOIN_FULL_BURN_MS + 500)).toBeLessThan(1);
    expect(afcJoinStreakAlpha(AFC_JOIN_ENGINE_CUT_MS)).toBe(0);
  });
});
