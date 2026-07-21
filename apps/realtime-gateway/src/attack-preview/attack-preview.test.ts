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

  it("applies the target's active fort defense bonus", () => {
    const fortJson = JSON.stringify({ ownerId: "player-2", status: "active", variant: "FORT" });
    const tilesWithFort = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson }
    ];
    const tilesWithoutFort = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" }
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const withFort = attackPreviewResult("player-1", tilesWithFort, undefined, message, [], []);
    const withoutFort = attackPreviewResult("player-1", tilesWithoutFort, undefined, message, [], []);

    expect(withFort.defMult).toBeCloseTo(1.35 * 2.5, 6);
    expect(withoutFort.defMult).toBeCloseTo(1.35, 6);
    expect((withFort.winChance as number)).toBeLessThan(withoutFort.winChance as number);
  });

  it("ignores a fort that is not active or not owned by the defender", () => {
    const inactiveFortJson = JSON.stringify({ ownerId: "player-2", status: "under_construction", variant: "FORT" });
    const wrongOwnerFortJson = JSON.stringify({ ownerId: "player-3", status: "active", variant: "FORT" });
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const inactivePreview = attackPreviewResult(
      "player-1",
      [
        { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson: inactiveFortJson }
      ],
      undefined,
      message,
      [],
      []
    );
    const wrongOwnerPreview = attackPreviewResult(
      "player-1",
      [
        { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson: wrongOwnerFortJson }
      ],
      undefined,
      message,
      [],
      []
    );

    expect(inactivePreview.defMult).toBeCloseTo(1.35, 6);
    expect(wrongOwnerPreview.defMult).toBeCloseTo(1.35, 6);
  });
});
