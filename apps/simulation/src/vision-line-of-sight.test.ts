import { describe, expect, it } from "vitest";
import { computeLosOffsets, intermediateRayPoints, rayIsBlockedByMountain, squareOffsets } from "./vision-line-of-sight.js";

describe("intermediateRayPoints", () => {
  it("returns no points for adjacent or same tile", () => {
    expect(intermediateRayPoints(0, 0)).toEqual([]);
    expect(intermediateRayPoints(1, 0)).toEqual([]);
    expect(intermediateRayPoints(1, 1)).toEqual([]);
  });

  it("returns the lattice points strictly between endpoints on a straight ray", () => {
    expect(intermediateRayPoints(4, 0)).toEqual([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
  });

  it("returns the lattice points strictly between endpoints on a diagonal ray", () => {
    expect(intermediateRayPoints(3, 3)).toEqual([
      [1, 1],
      [2, 2]
    ]);
  });
});

describe("rayIsBlockedByMountain", () => {
  it("is not blocked when no intermediate tile is a mountain", () => {
    const blocked = rayIsBlockedByMountain(0, 0, 4, 0, () => false);
    expect(blocked).toBe(false);
  });

  it("is blocked when an intermediate tile is a mountain", () => {
    const mountainAt = (x: number, y: number) => x === 2 && y === 0;
    expect(rayIsBlockedByMountain(0, 0, 4, 0, mountainAt)).toBe(true);
  });

  it("a mountain at the source or destination tile does not block itself", () => {
    // Mountain sits exactly at the destination (dx=4,dy=0 -> world (4,0)); the
    // ray only samples strictly-between points, so this must not self-block.
    const mountainAt = (x: number, y: number) => x === 4 && y === 0;
    expect(rayIsBlockedByMountain(0, 0, 4, 0, mountainAt)).toBe(false);
  });

  it("blocks diagonal rays through an intermediate mountain", () => {
    const mountainAt = (x: number, y: number) => x === 1 && y === 1;
    expect(rayIsBlockedByMountain(0, 0, 3, 3, mountainAt)).toBe(true);
  });
});

describe("computeLosOffsets", () => {
  it("returns the full square when there is no mountain", () => {
    const offsets = computeLosOffsets(10, 10, 2, () => false);
    expect(offsets.length).toBe(squareOffsets(2).length);
  });

  it("drops offsets whose ray is blocked by an intermediate mountain, but keeps the mountain tile itself", () => {
    // Mountain directly east at distance 1; radius 3 east should be blocked,
    // but the mountain tile (distance 1) and tiles on other bearings remain.
    const mountainAt = (x: number, y: number) => x === 11 && y === 10;
    const offsets = computeLosOffsets(10, 10, 3, mountainAt);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("1,0")).toBe(true); // the mountain tile itself is visible
    expect(offsetSet.has("2,0")).toBe(false); // behind the mountain, blocked
    expect(offsetSet.has("3,0")).toBe(false); // further behind, blocked
    expect(offsetSet.has("0,1")).toBe(true); // unrelated bearing, unaffected
    expect(offsetSet.has("-2,0")).toBe(true); // opposite direction, unaffected
  });

  it("opening a gap in a mountain ridge only reveals a narrow line-of-sight fan, not everything behind the ridge", () => {
    // Ridge of mountains at x=12 for y in [8..12], except a gap at y=10.
    const mountainAt = (x: number, y: number) => x === 12 && y >= 8 && y <= 12 && y !== 10;
    const offsets = computeLosOffsets(10, 10, 5, mountainAt);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    // Straight through the gap (dy=0) is visible.
    expect(offsetSet.has("5,0")).toBe(true);
    expect(offsetSet.has("4,0")).toBe(true);
    // Directly behind an intact ridge tile (dy=-2, i.e. y=8) stays hidden.
    expect(offsetSet.has("5,-2")).toBe(false);
    expect(offsetSet.has("5,2")).toBe(false);
    // Not every tile behind the ridge is revealed just because of one gap:
    // a tile far off the gap's bearing at the same range should remain blocked.
    expect(offsetSet.has("5,-3")).toBe(false);
  });
});
