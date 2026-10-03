import { describe, expect, it } from "vitest";
import { PATROL_PAUSE_MS, PATROL_RADIUS, PATROL_WALK_MS, patrolPoseAt } from "./client-map-3d-planetary-defense-patrol.js";

describe("patrolPoseAt", () => {
  it("always stays inside its own tile", () => {
    for (let t = 0; t < 60_000; t += 137) {
      for (const soldier of [0, 1]) {
        const pose = patrolPoseAt(17, 42, soldier, t);
        expect(Math.hypot(pose.offsetX, pose.offsetZ)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-9);
      }
    }
  });

  it("is deterministic for the same tile, soldier and time (scrub/rejoin safe)", () => {
    expect(patrolPoseAt(3, 9, 1, 12_345)).toEqual(patrolPoseAt(3, 9, 1, 12_345));
  });

  it("actually moves over time, alternating walking legs and pauses", () => {
    const cycle = PATROL_WALK_MS + PATROL_PAUSE_MS;
    const seen = new Set<boolean>();
    const positions = new Set<string>();
    for (let t = 0; t < cycle * 3; t += 200) {
      const pose = patrolPoseAt(8, 8, 0, t);
      seen.add(pose.walking);
      positions.add(`${pose.offsetX.toFixed(3)},${pose.offsetZ.toFixed(3)}`);
    }
    expect(seen).toEqual(new Set([true, false]));
    expect(positions.size).toBeGreaterThan(5);
  });

  it("moves continuously (no teleports between frames)", () => {
    let prev = patrolPoseAt(5, 6, 1, 0);
    for (let t = 16; t < 30_000; t += 16) {
      const pose = patrolPoseAt(5, 6, 1, t);
      expect(Math.hypot(pose.offsetX - prev.offsetX, pose.offsetZ - prev.offsetZ)).toBeLessThan(0.02);
      prev = pose;
    }
  });

  it("gives the two soldiers on a tile different routes", () => {
    const a = patrolPoseAt(1, 1, 0, 5_000);
    const b = patrolPoseAt(1, 1, 1, 5_000);
    expect(a.offsetX === b.offsetX && a.offsetZ === b.offsetZ).toBe(false);
  });
});
