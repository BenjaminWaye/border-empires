import { WORLD_WIDTH } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import {
  EXPAND_CREW_KNEEL_MS,
  EXPAND_CREW_SIZE,
  EXPAND_CREW_WALK_MS,
  expandCrewAnchor,
  expandCrewArrivalPoint,
  expandCrewFigurePose,
  expandCrewFromStep,
  expandCrewPlateProgress,
  type ExpandCrewClaim
} from "./client-expand-crew.js";
import { patrolPoseAt, PATROL_RADIUS } from "../client-map-3d-planetary-defense-patrol.js";

const claim: ExpandCrewClaim = { targetX: 10, targetY: 20, startAt: 0, resolvesAt: 7_500, crew: EXPAND_CREW_SIZE, fromStep: { dx: 1, dy: 0 } };

describe("expand crew poses", () => {
  it("sends two soldiers, like a Planetary Defense patrol", () => {
    expect(EXPAND_CREW_SIZE).toBe(2);
  });

  it("walks each soldier out of the origin tile, facing the target, onto its patrol", () => {
    const first = expandCrewFigurePose(claim, 0, 1, true)!;
    expect(first.x).toBeGreaterThan(1);
    expect(first.stance).toBe("walk");
    // Origin is east: facing west, i.e. atan2(dx < 0, ·) < 0.
    expect(Math.sin(first.yaw)).toBeLessThan(0);

    const arrived = expandCrewFigurePose(claim, 0, EXPAND_CREW_WALK_MS, true)!;
    const arrival = expandCrewArrivalPoint(claim, 0);
    expect(arrived.x).toBeCloseTo(arrival.x, 5);
    expect(arrived.y).toBeCloseTo(arrival.y, 5);
  });

  it("then idles around the tile on the same path as a Planetary Defense patrol", () => {
    const now = 4_000;
    const pose = expandCrewFigurePose(claim, 1, now, true)!;
    const patrol = patrolPoseAt(claim.targetX, claim.targetY, 1, now);
    expect(pose.x).toBeCloseTo(0.5 + patrol.offsetX, 9);
    expect(pose.y).toBeCloseTo(0.5 + patrol.offsetZ, 9);
    expect(pose.stance).toBe(patrol.walking ? "walk" : "stand");
  });

  it("keeps the patrolling soldiers on the target tile", () => {
    for (let now = EXPAND_CREW_WALK_MS; now < claim.resolvesAt; now += 97) {
      for (let i = 0; i < claim.crew; i += 1) {
        const pose = expandCrewFigurePose(claim, i, now, true)!;
        expect(Math.hypot(pose.x - 0.5, pose.y - 0.5)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-9);
      }
    }
  });

  it("kneels to plant the claim at the end, then leaves", () => {
    expect(expandCrewFigurePose(claim, 0, claim.resolvesAt - EXPAND_CREW_KNEEL_MS - 1, true)?.stance).not.toBe("kneel");
    const kneeling = expandCrewFigurePose(claim, 0, claim.resolvesAt - EXPAND_CREW_KNEEL_MS / 2, true)!;
    const later = expandCrewFigurePose(claim, 0, claim.resolvesAt - 1, true)!;
    expect(kneeling.stance).toBe("kneel");
    // Planted: no drifting while kneeling.
    expect(later.x).toBe(kneeling.x);
    expect(later.y).toBe(kneeling.y);
    expect(expandCrewFigurePose(claim, 0, claim.resolvesAt, true)).toBeUndefined();
    expect(expandCrewFigurePose(claim, claim.crew, 3_000, true)).toBeUndefined();
  });

  it("stands the crew still where it would arrive with motion off", () => {
    const arrival = expandCrewArrivalPoint(claim, 1);
    for (const now of [0, 4_000]) {
      const pose = expandCrewFigurePose(claim, 1, now, false)!;
      expect(pose.x).toBe(arrival.x);
      expect(pose.y).toBe(arrival.y);
      expect(pose.stance).toBe("stand");
    }
    expect(expandCrewFigurePose(claim, 1, claim.resolvesAt - 10, false)?.stance).toBe("kneel");
  });

  it("holds the plate empty during the walk, then fills it by resolution", () => {
    expect(expandCrewPlateProgress(claim, EXPAND_CREW_WALK_MS / 2)).toBe(0);
    expect(expandCrewPlateProgress(claim, claim.resolvesAt)).toBe(1);
    // No known origin: nothing to walk, so the plate fills from the start.
    const noOrigin = { targetX: claim.targetX, targetY: claim.targetY, startAt: 0, resolvesAt: 7_500, crew: 2 };
    expect(expandCrewPlateProgress(noOrigin, 3_750)).toBeCloseTo(0.5, 5);
  });

  it("anchors the plate inside the patrol disc", () => {
    const anchor = expandCrewAnchor(claim);
    expect(Math.hypot(anchor.x - 0.5, anchor.y - 0.5)).toBeLessThanOrEqual(PATROL_RADIUS);
    expect(expandCrewAnchor({ ...claim, crew: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

// Regression: the walk window depended on `animate`, which is re-read every
// frame (the slow-device latch can trip mid-session, reduced motion can be
// toggled), so motion turning off mid-claim made the plate jump from empty to
// part-filled in one frame.
describe("motion turning off mid-claim", () => {
  it("keeps the plate's fill progress continuous", () => {
    expect(expandCrewPlateProgress(claim, EXPAND_CREW_WALK_MS / 2)).toBe(0);
    expect(expandCrewPlateProgress(claim, (EXPAND_CREW_WALK_MS + claim.resolvesAt) / 2)).toBeCloseTo(0.5, 5);
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
