import { describe, expect, it } from "vitest";
import { computeBorderContactPylons, computeBorderContactSegments } from "./client-reach-overlay-border-contact.js";

describe("computeBorderContactSegments", () => {
  it("flags a chord that appears on both my loop and a rival's loop", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 5, y: 1 }, to: { x: 5, y: 0 }, ownerId: "p2" }]; // reversed direction, same chord

    const result = computeBorderContactSegments("p1", mine, rival);

    expect(result).toEqual([{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 }, ownerIdA: "p1", ownerIdB: "p2" }]);
  });

  it("ignores a chord only on my own loop (no contact)", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 9, y: 9 }, to: { x: 9, y: 10 }, ownerId: "p2" }];

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });

  it("never reports contact with myself (dedup across owner ids)", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 }, ownerId: "p1" }];

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });

  it("dedupes when more than one other owner traces the same chord", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [
      { from: { x: 5, y: 0 }, to: { x: 5, y: 1 }, ownerId: "p2" },
      { from: { x: 5, y: 1 }, to: { x: 5, y: 0 }, ownerId: "p3" }
    ];

    expect(computeBorderContactSegments("p1", mine, rival)).toHaveLength(1);
  });
});

describe("computeBorderContactPylons", () => {
  it("flags a corner that appears in both my pylon set and a rival's", () => {
    const mine = [{ x: 5, y: 1 }];
    const rival = [{ x: 5, y: 1, ownerId: "p2" }];

    expect(computeBorderContactPylons("p1", mine, rival)).toEqual([{ x: 5, y: 1, ownerIdA: "p1", ownerIdB: "p2" }]);
  });

  it("ignores a corner nobody else's loop touches", () => {
    const mine = [{ x: 5, y: 1 }];
    const rival = [{ x: 9, y: 9, ownerId: "p2" }];

    expect(computeBorderContactPylons("p1", mine, rival)).toEqual([]);
  });
});
