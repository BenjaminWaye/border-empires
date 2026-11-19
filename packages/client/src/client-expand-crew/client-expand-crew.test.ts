import { WORLD_WIDTH } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import {
  EXPAND_CREW_SINK_MS,
  EXPAND_CREW_WALK_MS,
  expandCrewAnchor,
  expandCrewFigurePose,
  expandCrewFromStep,
  expandCrewPlateProgress,
  expandCrewStakePoint,
  type ExpandCrewClaim
} from "./client-expand-crew.js";

const claim: ExpandCrewClaim = { targetX: 10, targetY: 20, startAt: 0, resolvesAt: 7_500, crew: 4, fromStep: { dx: 1, dy: 0 } };

describe("expand crew poses", () => {
  it("starts each figure on the origin tile and ends the walk on its stake", () => {
    const first = expandCrewFigurePose(claim, 0, 0, true)!;
    expect(first.x).toBeGreaterThan(1);
    const staked = expandCrewFigurePose(claim, 0, EXPAND_CREW_WALK_MS, true)!;
    const stake = expandCrewStakePoint(claim, 0);
    expect(staked.x).toBeCloseTo(stake.x, 5);
    expect(staked.y).toBeCloseTo(stake.y, 5);
  });

  it("keeps every staked figure on the target tile while it shuffles", () => {
    for (let now = EXPAND_CREW_WALK_MS; now < 7_000; now += 97) {
      for (let i = 0; i < claim.crew; i += 1) {
        const pose = expandCrewFigurePose(claim, i, now, true)!;
        expect(pose.x).toBeGreaterThan(0);
        expect(pose.x).toBeLessThan(1);
        expect(pose.y).toBeGreaterThan(0);
        expect(pose.y).toBeLessThan(1);
      }
    }
  });

  it("sinks the crew into the claim as it completes, and drops them after", () => {
    expect(expandCrewFigurePose(claim, 0, claim.resolvesAt - EXPAND_CREW_SINK_MS - 1, true)?.height).toBe(1);
    expect(expandCrewFigurePose(claim, 0, claim.resolvesAt - EXPAND_CREW_SINK_MS / 2, true)?.height).toBeCloseTo(0.5, 1);
    expect(expandCrewFigurePose(claim, 0, claim.resolvesAt, true)).toBeUndefined();
    expect(expandCrewFigurePose(claim, claim.crew, 3_000, true)).toBeUndefined();
  });

  it("stands the crew still on their stakes with motion off", () => {
    const pose = expandCrewFigurePose(claim, 1, 0, false)!;
    const stake = expandCrewStakePoint(claim, 1);
    expect(pose).toEqual({ ...stake, height: 1 });
    expect(expandCrewFigurePose(claim, 1, 4_000, false)).toEqual({ ...stake, height: 1 });
  });

  it("holds the plate empty during the walk, then fills it by resolution", () => {
    expect(expandCrewPlateProgress(claim, EXPAND_CREW_WALK_MS / 2, true)).toBe(0);
    expect(expandCrewPlateProgress(claim, claim.resolvesAt, true)).toBe(1);
    expect(expandCrewPlateProgress(claim, claim.resolvesAt / 2, false)).toBeCloseTo(0.5, 5);
    // No known origin: nothing to walk, so the plate fills from the start.
    const noOrigin = { targetX: claim.targetX, targetY: claim.targetY, startAt: 0, resolvesAt: 7_500, crew: 4 };
    expect(expandCrewPlateProgress(noOrigin, 3_750, true)).toBeCloseTo(0.5, 5);
  });

  it("anchors the plate inside the tile", () => {
    const anchor = expandCrewAnchor(claim);
    for (const v of [anchor.x, anchor.y]) {
      expect(v).toBeGreaterThanOrEqual(0.28);
      expect(v).toBeLessThanOrEqual(0.72);
    }
    expect(expandCrewAnchor({ ...claim, crew: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("expandCrewFromStep", () => {
  it("walks in from an adjacent launch tile, wrapping the world edge", () => {
    expect(expandCrewFromStep({ x: 5, y: 5 }, { x: 4, y: 6 }, () => false)).toEqual({ dx: -1, dy: 1 });
    expect(expandCrewFromStep({ x: 0, y: 5 }, { x: WORLD_WIDTH - 1, y: 5 }, () => false)).toEqual({ dx: -1, dy: 0 });
  });

  it("gives no step for a launch tile that isn't adjacent (a dock crossing)", () => {
    expect(expandCrewFromStep({ x: 5, y: 5 }, { x: 15, y: 5 }, () => true)).toBeUndefined();
  });

  it("falls back to this player's own neighbour, orthogonal first", () => {
    const mine = new Set(["6,6", "5,6"]);
    expect(expandCrewFromStep({ x: 5, y: 5 }, undefined, (x, y) => mine.has(`${x},${y}`))).toEqual({ dx: 0, dy: 1 });
    expect(expandCrewFromStep({ x: 5, y: 5 }, undefined, () => false)).toBeUndefined();
  });
});
