import { beforeAll, describe, expect, it } from "vitest";
import {
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_MS,
  HILLS_FRONTIER_CLAIM_PENALTY_MS,
  isForestTileAt,
  isHillsTileAt,
  setWorldSeed
} from "../index.js";
import { frontierClaimDurationMsAt } from "./frontier-claim-duration.js";

// Regression coverage for the bug this module fixed: three of the four call
// sites that used to reimplement this formula locally (waypoint planner,
// game-domain worldgen, and — before the consolidation to this shared
// function — a slightly different client copy) applied only the forest
// multiplier and silently dropped the hills penalty entirely. Scans a small
// coordinate range at a fixed seed to find a real plain/forest/hills tile of
// each kind, rather than hardcoding coordinates that could shift if worldgen
// tuning changes.
describe("frontierClaimDurationMsAt", () => {
  let plainTile: { x: number; y: number } | undefined;
  let forestTile: { x: number; y: number } | undefined;
  let hillsTile: { x: number; y: number } | undefined;

  beforeAll(() => {
    setWorldSeed(1);
    for (let x = 0; x < 200 && (!plainTile || !forestTile || !hillsTile); x++) {
      for (let y = 0; y < 200 && (!plainTile || !forestTile || !hillsTile); y++) {
        const forest = isForestTileAt(x, y);
        const hills = isHillsTileAt(x, y);
        if (forest && !forestTile) forestTile = { x, y };
        else if (hills && !hillsTile) hillsTile = { x, y };
        else if (!forest && !hills && !plainTile) plainTile = { x, y };
      }
    }
  });

  it("returns the flat base duration for a plain (non-forest, non-hills) tile", () => {
    expect(plainTile).toBeDefined();
    expect(frontierClaimDurationMsAt(plainTile!.x, plainTile!.y)).toBe(FRONTIER_CLAIM_MS);
  });

  it("multiplies the base duration for a forest tile", () => {
    expect(forestTile).toBeDefined();
    expect(frontierClaimDurationMsAt(forestTile!.x, forestTile!.y)).toBe(FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT);
  });

  it("adds the flat penalty for a hills tile", () => {
    expect(hillsTile).toBeDefined();
    expect(frontierClaimDurationMsAt(hillsTile!.x, hillsTile!.y)).toBe(FRONTIER_CLAIM_MS + HILLS_FRONTIER_CLAIM_PENALTY_MS);
  });
});
