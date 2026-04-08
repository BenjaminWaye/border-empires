import { describe, expect, it } from "vitest";
import {
  observatoryCooldownReadyAt,
  observatoryProtectionActive,
  pickReadyObservatoryForTarget,
  soonestObservatoryReadyAt
} from "./observatory-cooldown.js";

const distance = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

describe("observatory cooldown helpers", () => {
  it("treats missing cooldowns as ready immediately", () => {
    expect(observatoryCooldownReadyAt({})).toBe(0);
    expect(observatoryProtectionActive({}, 100)).toBe(true);
  });

  it("disables protection while the observatory is cooling down", () => {
    expect(observatoryProtectionActive({ cooldownUntil: 150 }, 100)).toBe(false);
    expect(observatoryProtectionActive({ cooldownUntil: 150 }, 150)).toBe(true);
  });

  it("picks a ready observatory even if a closer one is still cooling down", () => {
    const picked = pickReadyObservatoryForTarget(
      [
        { observatoryId: "cooling", tileKey: "10,10", x: 10, y: 10, cooldownUntil: 500 },
        { observatoryId: "ready", tileKey: "14,14", x: 14, y: 14, cooldownUntil: 0 }
      ],
      12,
      12,
      200,
      distance
    );

    expect(picked?.observatoryId).toBe("ready");
  });

  it("reports the soonest observatory cooldown when all in-range observatories are busy", () => {
    expect(
      soonestObservatoryReadyAt([
        { tileKey: "10,10", cooldownUntil: 900 },
        { tileKey: "20,20", cooldownUntil: 650 }
      ])
    ).toBe(650);
  });
});
