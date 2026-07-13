import { describe, expect, it } from "vitest";

import { attackPreviewResult } from "./attack-preview.js";

describe("attackPreviewResult", () => {
  it("applies attackVsBarbariansMult when previewing an attack on a barbarian tile", () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "barbarian-1", ownershipState: "SETTLED" }
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const baseline = attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const boosted = attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(baseline.atkMult).toBe(1);
    expect(boosted.atkMult).toBeCloseTo(1.5, 6);
    expect((boosted.winChance as number)).toBeGreaterThan(baseline.winChance as number);
  });

  it("does not apply attackVsBarbariansMult when the target is not a barbarian", () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" }
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const preview = attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(preview.atkMult).toBe(1);
  });
});
