import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { supportRingCandidates, wideSupportRingScanRadiusFor } from "./town-support-ring.js";

type WideRingTestTile = { x: number; y: number; ownerId?: string; town?: { populationTier: string } };
const isOwnedWideRingTown = (playerId: string) => (tile: WideRingTestTile): boolean =>
  tile.ownerId === playerId && (tile.town?.populationTier === "GREAT_CITY" || tile.town?.populationTier === "METROPOLIS");

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

// REGRESSION (2026-09-12 prod incident): the old playerHasWideSupportRingTown
// gate asked "does this player own a wide-ring town ANYWHERE" and widened
// EVERY support-tile scan for that player once true -- including candidates
// nowhere near the actual town. One large empire's frontier-eligibility
// rebuild made 6650 such oversized scans in a single call, stacking into the
// event-loop stalls that caused the incident. wideSupportRingScanRadiusFor
// replaces it with a proximity-scoped check: only candidates actually near a
// wide-ring town get the wider scan.
describe("wideSupportRingScanRadiusFor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns radius 1 for a candidate far from the player's GREAT_CITY town, even though the player owns one", () => {
    const greatCity: WideRingTestTile = { x: 10, y: 10, ownerId: "player-1", town: { populationTier: "GREAT_CITY" } };
    const tiles = new Map<string, WideRingTestTile>([["10,10", greatCity]]);

    // Far away from the town -- this is the shape of the incident: a huge
    // frontier, most of it nowhere near the one Great City the player owns.
    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 200, 200, isOwnedWideRingTown("player-1"))).toBe(1);
  });

  it("returns radius 2 for a candidate within range of the player's GREAT_CITY town", () => {
    const greatCity: WideRingTestTile = { x: 10, y: 10, ownerId: "player-1", town: { populationTier: "GREAT_CITY" } };
    const tiles = new Map<string, WideRingTestTile>([["10,10", greatCity]]);

    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 12, 10, isOwnedWideRingTown("player-1"))).toBe(2);
  });

  it("returns radius 1 for a player who owns no wide-ring town at all", () => {
    const cityTile: WideRingTestTile = { x: 10, y: 10, ownerId: "player-1", town: { populationTier: "CITY" } };
    const tiles = new Map<string, WideRingTestTile>([["10,10", cityTile]]);

    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 10, 10, isOwnedWideRingTown("player-1"))).toBe(1);
  });

  it("accounts for world wrap when measuring distance to the wide-ring town", () => {
    const greatCity: WideRingTestTile = { x: 0, y: 20, ownerId: "player-1", town: { populationTier: "GREAT_CITY" } };
    const tiles = new Map<string, WideRingTestTile>([["0,20", greatCity]]);

    // Two tiles west of x=0 wraps around to WORLD_WIDTH - 2, distance 2.
    expect(wideSupportRingScanRadiusFor(tiles, "player-1", WORLD_WIDTH - 2, 20, isOwnedWideRingTown("player-1"))).toBe(2);
  });

  // REGRESSION: the position list is memoized against the live tiles map,
  // which (in the simulation) is a single object mutated in place for the
  // runtime's entire uptime, never reassigned -- so a zero-TTL cache would
  // compute "does this player own a wide-ring town" once and never again,
  // permanently missing a Great City the player upgrades to AFTER their
  // first check that process's lifetime. Verifies the TTL actually expires
  // and picks up a town that didn't exist on the first call.
  it("picks up a newly-upgraded Great City after the position cache's TTL expires", () => {
    vi.useFakeTimers();
    const cityTile: WideRingTestTile = { x: 10, y: 10, ownerId: "player-1", town: { populationTier: "CITY" } };
    const tiles = new Map<string, WideRingTestTile>([["10,10", cityTile]]);

    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 12, 10, isOwnedWideRingTown("player-1"))).toBe(1);

    // Same tile, same Map object (mirroring the simulation's persistent
    // this.state.tiles), now upgraded to GREAT_CITY.
    tiles.set("10,10", { ...cityTile, town: { populationTier: "GREAT_CITY" } });

    // Still within the TTL window: cached "no wide-ring town" answer holds.
    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 12, 10, isOwnedWideRingTown("player-1"))).toBe(1);

    vi.advanceTimersByTime(60_001);

    // Past the TTL: rescans and picks up the upgrade.
    expect(wideSupportRingScanRadiusFor(tiles, "player-1", 12, 10, isOwnedWideRingTown("player-1"))).toBe(2);
  });
});
