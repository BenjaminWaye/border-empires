import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { supportRingCandidates } from "./town-support-ring.js";

describe("supportRingCandidates", () => {
  it("returns all 8 neighbors at radius 1, excluding the center", () => {
    const tiles = new Map<string, { x: number; y: number }>();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        tiles.set(`${10 + dx},${10 + dy}`, { x: 10 + dx, y: 10 + dy });
      }
    }

    const result = supportRingCandidates(tiles, 10, 10, 1);

    expect(result).toHaveLength(8);
    expect(result.some((c) => c.dx === 0 && c.dy === 0)).toBe(false);
  });

  it("returns all 24 candidates at radius 2", () => {
    const tiles = new Map<string, { x: number; y: number }>();
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        tiles.set(`${10 + dx},${10 + dy}`, { x: 10 + dx, y: 10 + dy });
      }
    }

    const result = supportRingCandidates(tiles, 10, 10, 2);

    expect(result).toHaveLength(24);
  });

  it("skips a candidate coordinate with no tile in the map", () => {
    const tiles = new Map<string, { x: number; y: number }>([["11,10", { x: 11, y: 10 }]]);

    const result = supportRingCandidates(tiles, 10, 10, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.tile).toEqual({ x: 11, y: 10 });
  });

  // REGRESSION (2026-09-10): this is the exact bug class this consolidation
  // is meant to make structurally impossible -- a hand-rolled scan using a
  // raw (non-wrapped) neighbor key silently missing a tile right at a world
  // edge. supportRingCandidates wraps by construction.
  it("wraps at the map's x edge", () => {
    const farTile = { x: WORLD_WIDTH - 1, y: 20 };
    const tiles = new Map<string, { x: number; y: number }>([[`${WORLD_WIDTH - 1},20`, farTile]]);

    // One tile west of x=0 wraps to WORLD_WIDTH - 1.
    const result = supportRingCandidates(tiles, 0, 20, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.tile).toBe(farTile);
    expect(result[0]!.dx).toBe(-1);
  });

  it("wraps at the map's y edge", () => {
    const farTile = { x: 20, y: WORLD_HEIGHT - 1 };
    const tiles = new Map<string, { x: number; y: number }>([[`20,${WORLD_HEIGHT - 1}`, farTile]]);

    const result = supportRingCandidates(tiles, 20, 0, 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.tile).toBe(farTile);
    expect(result[0]!.dy).toBe(-1);
  });

  it("returns an empty array when radius is 0 (no self-candidate)", () => {
    const tiles = new Map<string, { x: number; y: number }>([["10,10", { x: 10, y: 10 }]]);
    expect(supportRingCandidates(tiles, 10, 10, 0)).toHaveLength(0);
  });
});
