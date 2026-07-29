import { describe, expect, it } from "vitest";
import {
  computeLosOffsets,
  intermediateRayPoints,
  pathPointsExcludingSource,
  rayIsBlockedByMountain,
  rayIsOccludedByForest,
  squareOffsets
} from "./vision-line-of-sight.js";

const noForest = () => false;
const noMountain = () => false;

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

describe("pathPointsExcludingSource", () => {
  it("returns no points for the source's own cell", () => {
    expect(pathPointsExcludingSource(0, 0)).toEqual([]);
  });

  it("includes the candidate endpoint, unlike intermediateRayPoints", () => {
    expect(pathPointsExcludingSource(3, 0)).toEqual([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
  });
});

describe("rayIsOccludedByForest", () => {
  it("is not occluded when no forest lies along the path", () => {
    expect(rayIsOccludedByForest(0, 0, 4, 0, noForest)).toBe(false);
  });

  it("the source tile's own forest-ness never occludes its own vision", () => {
    // forestAt matches (0,0) — the source itself — which must be ignored.
    const forestAt = (x: number, y: number) => x === 0 && y === 0;
    expect(rayIsOccludedByForest(0, 0, 4, 0, forestAt)).toBe(false);
  });

  it("cuts vision off FOREST_VISION_RANGE (1) tiles past the first forest tile on the path", () => {
    // Forest at distance 1 east; candidate at distance 3 is 2 tiles past the
    // forest (1 allowed + 1 over) -> occluded. Candidate at distance 2 is
    // exactly 1 tile past -> still visible.
    const forestAt = (x: number, y: number) => x === 1 && y === 0;
    expect(rayIsOccludedByForest(0, 0, 2, 0, forestAt)).toBe(false); // 1 tile past the forest: visible
    expect(rayIsOccludedByForest(0, 0, 3, 0, forestAt)).toBe(true); // 2 tiles past: occluded
  });

  it("a forest tile that is itself the candidate stays visible", () => {
    const forestAt = (x: number, y: number) => x === 3 && y === 0;
    expect(rayIsOccludedByForest(0, 0, 3, 0, forestAt)).toBe(false);
  });

  it("occlusion is independent of ownership — an unowned forest tile between two unrelated points still occludes", () => {
    // Simulates a normal (non-forest) tile looking through unowned forest
    // terrain at something farther away; forestAt has no concept of ownership.
    const forestAt = (x: number, y: number) => x === 2 && y === 0;
    expect(rayIsOccludedByForest(0, 0, 5, 0, forestAt)).toBe(true);
  });
});

describe("computeLosOffsets", () => {
  it("returns the full square when there is no mountain or forest", () => {
    const offsets = computeLosOffsets(10, 10, 2, noMountain, noForest);
    expect(offsets.length).toBe(squareOffsets(2).length);
  });

  it("drops offsets whose ray is blocked by an intermediate mountain, but keeps the mountain tile itself", () => {
    // Mountain directly east at distance 1; radius 3 east should be blocked,
    // but the mountain tile (distance 1) and tiles on other bearings remain.
    const mountainAt = (x: number, y: number) => x === 11 && y === 10;
    const offsets = computeLosOffsets(10, 10, 3, mountainAt, noForest);
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
    const offsets = computeLosOffsets(10, 10, 5, mountainAt, noForest);
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

  it("drops offsets cut short by forest occlusion, independent of mountain occlusion", () => {
    const forestAt = (x: number, y: number) => x === 11 && y === 10; // 1 tile east of source
    const offsets = computeLosOffsets(10, 10, 4, noMountain, forestAt);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("1,0")).toBe(true); // the forest tile itself
    expect(offsetSet.has("2,0")).toBe(true); // 1 tile past the forest: still visible
    expect(offsetSet.has("3,0")).toBe(false); // 2 tiles past: occluded
    expect(offsetSet.has("4,0")).toBe(false);
    expect(offsetSet.has("0,1")).toBe(true); // unrelated bearing, unaffected
  });

  it("standing on a forest source tile does not clamp the source's own vision", () => {
    // forestAt matches the source tile only — must not affect any offset.
    const forestAt = (x: number, y: number) => x === 10 && y === 10;
    const offsets = computeLosOffsets(10, 10, 4, noMountain, forestAt);
    expect(offsets.length).toBe(squareOffsets(4).length);
  });

  it("mountain and forest occlusion combine on the same offset set", () => {
    const mountainAt = (x: number, y: number) => x === 9 && y === 10; // 1 tile west
    const forestAt = (x: number, y: number) => x === 11 && y === 10; // 1 tile east
    const offsets = computeLosOffsets(10, 10, 4, mountainAt, forestAt);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    // West: mountain blocks everything beyond it.
    expect(offsetSet.has("-1,0")).toBe(true);
    expect(offsetSet.has("-2,0")).toBe(false);
    // East: forest allows 1 tile past it, then blocks.
    expect(offsetSet.has("1,0")).toBe(true);
    expect(offsetSet.has("2,0")).toBe(true);
    expect(offsetSet.has("3,0")).toBe(false);
  });
});
