import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  applyServerReachUpdate,
  clearServerReach,
  reachCacheKey,
  resolveMyReach,
  resolveMyReachCached,
  type ReachAuthoritativeState,
  type ReachCacheState
} from "./client-reach-authoritative.js";

const stateWith = (overrides: Partial<ReachAuthoritativeState> = {}): ReachAuthoritativeState => ({
  me: "me",
  tiles: new Map(),
  serverReach: undefined,
  serverReachRevision: 0,
  ...overrides
});

describe("authoritative reach on the client", () => {
  it("applies a REACH_UPDATE and exposes it as the reach set", () => {
    const state = stateWith();
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1", "1,2"], revision: 1 })).toBe(true);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "1,2"]));
  });

  it("falls back to the local approximation before the first message", () => {
    // No anchors in an empty tile map, so the fallback is empty -- the point
    // is that it does not throw and does not report a bogus reach.
    expect(resolveMyReach(stateWith())).toEqual(new Set());
  });

  it("prefers an empty server set over the local approximation", () => {
    // An empty authoritative border is a real answer ("you reach nothing"),
    // not a missing one -- it must not silently fall back to the guess.
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: [], revision: 1 });
    expect(state.serverReach).toEqual(new Set());
    expect(resolveMyReach(state)).toEqual(new Set());
  });

  it("drops a stale, out-of-order revision", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1", "2,2"], revision: 7 });
    expect(applyServerReachUpdate(state, { tileKeys: ["9,9"], revision: 6 })).toBe(false);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "2,2"]));
  });

  it("accepts revision 1 as a fresh sequence after a reconnect", () => {
    // The simulation restarts revisions at 1 per player; the client's counter
    // can be higher from before a reconnect the simulation never saw.
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 9 });
    expect(applyServerReachUpdate(state, { tileKeys: ["5,5"], revision: 1 })).toBe(true);
    expect(resolveMyReach(state)).toEqual(new Set(["5,5"]));
  });

  it("ignores a malformed payload", () => {
    const state = stateWith();
    expect(applyServerReachUpdate(state, {})).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: "nope" })).toBe(false);
    expect(state.serverReach).toBeUndefined();
  });

  it("rejects a missing or invalid revision instead of defaulting it", () => {
    // A default of 0 used to skip the staleness check outright (0 is never
    // > 1) and reset serverReachRevision to 0, silently disabling ordering
    // protection for every later update too.
    const state = stateWith();
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"] })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: "1" })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 0 })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: -1 })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: Number.NaN })).toBe(false);
    expect(state.serverReach).toBeUndefined();
    expect(state.serverReachRevision).toBe(0);
  });

  it("does not let an invalid revision reset protection for a later stale one", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 5 });
    applyServerReachUpdate(state, { tileKeys: ["9,9"] }); // malformed, must not touch serverReachRevision
    expect(applyServerReachUpdate(state, { tileKeys: ["2,2"], revision: 3 })).toBe(false);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1"]));
  });

  it("skips non-string entries rather than poisoning the set", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1", 42, null, "2,2"], revision: 1 });
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "2,2"]));
  });

  it("clearServerReach reverts to the local approximation", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 3 });
    clearServerReach(state);
    expect(state.serverReach).toBeUndefined();
    expect(state.serverReachRevision).toBe(0);
    expect(resolveMyReach(state)).toEqual(new Set());
  });
});

/** A tiles Map that counts full scans (the O(tiles) part of computeLocalReachSet). */
class ScanCountingTiles extends Map<string, Tile> {
  scans = 0;
  override values(): MapIterator<Tile> {
    this.scans += 1;
    return super.values();
  }
}

const dockTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "me", dockId: `dock-${x}-${y}` }) as unknown as Tile;

const cacheStateWith = (tiles: ScanCountingTiles, overrides: Partial<ReachCacheState> = {}): ReachCacheState => ({
  me: "me",
  tiles,
  serverReach: undefined,
  serverReachRevision: 0,
  tilesRevision: 1,
  myReach: undefined,
  myReachRevisionAtCompute: "",
  ...overrides
});

describe("resolveMyReachCached", () => {
  it("does not rescan tiles while tilesRevision and server reach are unchanged (per-frame callers)", () => {
    const tiles = new ScanCountingTiles([["5,5", dockTile(5, 5)]]);
    const state = cacheStateWith(tiles);
    const first = resolveMyReachCached(state);
    expect(first.has("5,5")).toBe(true);
    expect(tiles.scans).toBe(1);
    for (let frame = 0; frame < 100; frame += 1) expect(resolveMyReachCached(state)).toBe(first);
    expect(tiles.scans).toBe(1);
  });

  it("recomputes once after tilesRevision bumps and sees the new tiles", () => {
    const tiles = new ScanCountingTiles([["5,5", dockTile(5, 5)]]);
    const state = cacheStateWith(tiles);
    expect(resolveMyReachCached(state).has("20,20")).toBe(false);
    tiles.set("20,20", dockTile(20, 20));
    expect(resolveMyReachCached(state).has("20,20")).toBe(false); // revision not bumped yet: still the cached answer
    state.tilesRevision += 1;
    expect(resolveMyReachCached(state).has("20,20")).toBe(true);
    resolveMyReachCached(state);
    expect(tiles.scans).toBe(2);
  });

  it("returns the server set without scanning tiles, and shares it through state.myReach", () => {
    const tiles = new ScanCountingTiles([["5,5", dockTile(5, 5)]]);
    const state = cacheStateWith(tiles);
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    expect(resolveMyReachCached(state)).toBe(state.serverReach);
    expect(state.myReach).toBe(state.serverReach);
    expect(tiles.scans).toBe(0);
  });

  it("switches from the cached local approximation to the server set when a REACH_UPDATE lands with no tile change", () => {
    const tiles = new ScanCountingTiles([["5,5", dockTile(5, 5)]]);
    const state = cacheStateWith(tiles);
    expect(resolveMyReachCached(state).has("5,5")).toBe(true);
    applyServerReachUpdate(state, { tileKeys: ["9,9"], revision: 1 });
    expect(resolveMyReachCached(state)).toEqual(new Set(["9,9"]));
  });

  it("returns the new server set after clearServerReach + a restarted revision-1 update with unchanged tilesRevision", () => {
    // Regression: serverReachRevision restarts at 1 after a reconnect, so a
    // `${tilesRevision}:${serverReachRevision}` key matched the previous
    // session's cache entry and served its stale border.
    const tiles = new ScanCountingTiles();
    const state = cacheStateWith(tiles);
    applyServerReachUpdate(state, { tileKeys: ["1,1", "1,2"], revision: 1 });
    expect(resolveMyReachCached(state)).toEqual(new Set(["1,1", "1,2"]));
    const keyBefore = reachCacheKey(state);
    clearServerReach(state);
    applyServerReachUpdate(state, { tileKeys: ["7,7"], revision: 1 });
    expect(state.tilesRevision).toBe(1);
    expect(reachCacheKey(state)).not.toBe(keyBefore);
    expect(resolveMyReachCached(state)).toEqual(new Set(["7,7"]));
  });

  it("is also correct when a frame cached the local fallback between the clear and the restarted update", () => {
    const tiles = new ScanCountingTiles([["5,5", dockTile(5, 5)]]);
    const state = cacheStateWith(tiles);
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    resolveMyReachCached(state);
    clearServerReach(state);
    expect(resolveMyReachCached(state).has("5,5")).toBe(true); // local fallback, now cached
    applyServerReachUpdate(state, { tileKeys: ["7,7"], revision: 1 });
    expect(resolveMyReachCached(state)).toEqual(new Set(["7,7"]));
  });

  it("returns the latest set when a same-revision-1 update replaces the previous one without a clear", () => {
    const state = cacheStateWith(new ScanCountingTiles());
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    expect(resolveMyReachCached(state)).toEqual(new Set(["1,1"]));
    applyServerReachUpdate(state, { tileKeys: ["2,2"], revision: 1 });
    expect(resolveMyReachCached(state)).toEqual(new Set(["2,2"]));
  });
});
