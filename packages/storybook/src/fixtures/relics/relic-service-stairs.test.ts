import { describe, expect, it } from "vitest";
import { RELIC_DOOR_HEIGHT, relicStairTreads } from "./relic-service-stairs.js";

describe("relic access at doorway scale", () => {
  it("uses human-sized risers and enough room for a foot", () => {
    const treads = relicStairTreads();
    expect(treads.length).toBeGreaterThan(0);
    for (const tread of treads) {
      // At a two-metre door these limits are a 20 cm rise and 30 cm going.
      expect(tread.riser).toBeLessThanOrEqual(RELIC_DOOR_HEIGHT / 10);
      expect(tread.going).toBeGreaterThanOrEqual(RELIC_DOOR_HEIGHT * 0.15);
    }
  });

  it("reaches the door landing without another giant final step", () => {
    const top = Math.max(...relicStairTreads().map((step) => step.y));
    expect(Math.abs(top - 0.795)).toBeLessThanOrEqual(RELIC_DOOR_HEIGHT / 10);
  });

  it("keeps the approach and every flight transition within one normal riser", () => {
    let previousY = 0;
    for (const step of relicStairTreads()) {
      expect(step.y - previousY).toBeGreaterThan(0);
      expect(step.y - previousY).toBeLessThanOrEqual(RELIC_DOOR_HEIGHT / 10);
      previousY = step.y;
    }
  });
});
