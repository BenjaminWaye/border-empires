import { describe, expect, it } from "vitest";
import { computeBorderContactPylons, computeBorderContactSegments, segmentTouchesAnySeam } from "./client-reach-overlay-border-contact.js";

describe("computeBorderContactSegments", () => {
  it("clips to the overlap when two walls are the same length and fully coincide", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 5, y: 1 }, to: { x: 5, y: 0 }, ownerId: "p2" }]; // reversed direction, same chord

    const result = computeBorderContactSegments("p1", mine, rival);

    expect(result).toEqual([{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 }, ownerIdA: "p1", ownerIdB: "p2" }]);
  });

  // The actual bug this test locks in: samplePerimeterPylons emits one
  // sparse segment per whole straight wall, not one per tile edge, so two
  // touching empires' walls are essentially never the same length -- a
  // shorter wall (here, land clipped by a coastline) overlapping a longer
  // one (here, an unclipped neighbor) must still be detected, and the seam
  // must be the actual overlap, not either original wall.
  it("detects contact between two collinear walls of DIFFERENT length, clipped to the overlap", () => {
    const mine = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 } }]; // my east wall, clipped short by a coastline
    const rival = [{ from: { x: 12, y: 17 }, to: { x: 12, y: 10 }, ownerId: "p2" }]; // rival's longer west wall, reversed

    const result = computeBorderContactSegments("p1", mine, rival);

    expect(result).toEqual([{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }]);
  });

  it("does not report contact when two collinear walls only touch at a single point (zero-length overlap)", () => {
    const mine = [{ from: { x: 5, y: 10 }, to: { x: 12, y: 10 } }]; // my north wall
    const rival = [{ from: { x: 12, y: 10 }, to: { x: 19, y: 10 }, ownerId: "p2" }]; // rival's north wall, touches mine only at the shared corner (12,10)

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });

  it("ignores a wall only on my own loop (no contact)", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 9, y: 9 }, to: { x: 9, y: 10 }, ownerId: "p2" }];

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });

  it("ignores a collinear wall belonging to myself under a different array (dedup across owner ids)", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 } }];
    const rival = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 1 }, ownerId: "p1" }];

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });

  it("does not treat perpendicular walls sharing a corner as contact", () => {
    const mine = [{ from: { x: 5, y: 0 }, to: { x: 5, y: 5 } }]; // vertical
    const rival = [{ from: { x: 5, y: 5 }, to: { x: 9, y: 5 }, ownerId: "p2" }]; // horizontal, meets mine only at the corner

    expect(computeBorderContactSegments("p1", mine, rival)).toEqual([]);
  });
});

describe("segmentTouchesAnySeam", () => {
  it("is true for a rendered wall whose overlap with a seam is only partial", () => {
    // The rendered wall is the full, unclipped (12,10)-(12,17); the seam is the clipped overlap (12,10)-(12,15).
    const seams = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }];

    expect(segmentTouchesAnySeam({ x: 12, y: 10 }, { x: 12, y: 17 }, seams)).toBe(true);
  });

  it("is false for a wall on a different line entirely", () => {
    const seams = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }];

    expect(segmentTouchesAnySeam({ x: 20, y: 10 }, { x: 20, y: 15 }, seams)).toBe(false);
  });

  it("is false for a collinear wall that only touches the seam at a single point", () => {
    const seams = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }];

    expect(segmentTouchesAnySeam({ x: 12, y: 15 }, { x: 12, y: 20 }, seams)).toBe(false);
  });
});

describe("computeBorderContactPylons", () => {
  it("flags a pylon point that falls on a seam's overlap range, even if it isn't a seam endpoint", () => {
    const seams = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }];
    const mine = [{ x: 12, y: 12 }]; // midpoint of the seam, not one of its own endpoints

    expect(computeBorderContactPylons("p1", mine, [], seams)).toEqual([{ x: 12, y: 12, ownerIdA: "p1", ownerIdB: "p2" }]);
  });

  it("ignores a pylon point off any seam", () => {
    const seams = [{ from: { x: 12, y: 10 }, to: { x: 12, y: 15 }, ownerIdA: "p1", ownerIdB: "p2" }];
    const mine = [{ x: 9, y: 9 }];

    expect(computeBorderContactPylons("p1", mine, [], seams)).toEqual([]);
  });

  it("returns nothing when there are no seams at all", () => {
    expect(computeBorderContactPylons("p1", [{ x: 5, y: 1 }], [{ x: 5, y: 1, ownerId: "p2" }], [])).toEqual([]);
  });
});
