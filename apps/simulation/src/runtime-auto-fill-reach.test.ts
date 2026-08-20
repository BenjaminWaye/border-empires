import { describe, expect, it } from "vitest";
import { applyAutoFill, findEnclosedRegion, findEnclosedRegionsAdjacentTo } from "./runtime-auto-fill.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";

// Fixed-border reach gating for auto-fill (see runtime-auto-fill.ts's isInReach
// doc comments). Split out from runtime-auto-fill.test.ts to keep that file
// under the repo's file-size cap — see AGENTS.md's file-and-type discipline.

const landTile = (x: number, y: number, partial?: Partial<DomainTileState>): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ...partial
});

const ownedTile = (x: number, y: number, ownerId: string, partial?: Partial<DomainTileState>): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  ...partial
});

describe("findEnclosedRegion reach gating on walls", () => {
  it("returns null when a would-be SETTLED wall lies outside the enclosing player's reach", () => {
    // Same 1-tile pocket as the baseline enclosed-by-SETTLED-walls case, but
    // the reach predicate excludes one wall tile (2,1): the seal isn't backed
    // by the player's live reach, so the whole scan fails — the same as
    // leaking to an enemy tile — even though every OTHER wall (and the
    // interior tile itself) is in reach.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    const isInReach = (x: number, y: number): boolean => !(x === 2 && y === 1);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1", isInReach)).toBeNull();
  });

  it("returns null when a would-be natural-barrier (sea/mountain) wall lies outside reach", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), { x: 2, y: 1, terrain: "SEA" }],
      [simulationTileKey(1, 2), { x: 1, y: 2, terrain: "SEA" }],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    // The (1,2) sea tile is out of reach; the (2,1) sea tile is in reach.
    const isInReach = (x: number, y: number): boolean => !(x === 1 && y === 2);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1", isInReach)).toBeNull();
  });

  it("seals normally when every wall tile is individually confirmed in reach, not just true-for-everything", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    const reachCovered = new Set([
      simulationTileKey(1, 1),
      simulationTileKey(2, 1),
      simulationTileKey(0, 1),
      simulationTileKey(1, 0),
      simulationTileKey(1, 2)
    ]);
    const isInReach = (x: number, y: number): boolean => reachCovered.has(simulationTileKey(x, y));
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1", isInReach);
    expect(region).toEqual(new Set([simulationTileKey(1, 1)]));
  });
});

describe("findEnclosedRegionsAdjacentTo reach gating", () => {
  it("scanCooldown: does NOT cache a wall-out-of-reach failure, so reach catching up seals immediately", () => {
    // Mirrors the enemy-leak scan-cooldown case in runtime-auto-fill.test.ts:
    // a wall outside reach fails the scan the same `return null` way a leak
    // does, and must stay eagerly re-scanned too — reach can grow (a new
    // outpost, a captured dock) independently of any settle near this origin,
    // so caching the failure could delay sealing a pocket well past when
    // reach actually caught up.
    const tile = ownedTile(2, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(2, 2), tile],
      [simulationTileKey(1, 2), landTile(1, 2)],
      [simulationTileKey(1, 1), ownedTile(1, 1, "player-1")],
      [simulationTileKey(1, 3), ownedTile(1, 3, "player-1")],
      [simulationTileKey(0, 2), ownedTile(0, 2, "player-1")]
    ]);
    const originCooldownUntil = new Map<string, number>();
    let reachCoversFarWall = false;
    const isInReach = (x: number, y: number): boolean => !(x === 0 && y === 2) || reachCoversFarWall;

    const first = findEnclosedRegionsAdjacentTo(tile, tiles, "player-1", isInReach, {
      now: 1000,
      cooldownMs: 3000,
      originCooldownUntil
    });
    expect(first).toEqual([]);
    // Out-of-reach-wall failure — must NOT be cached, same as a leak.
    expect(originCooldownUntil.has(simulationTileKey(1, 2))).toBe(false);

    // Reach catches up to the far wall (e.g. a new outpost). The next scan,
    // well inside the old cooldown window, must fill immediately.
    reachCoversFarWall = true;
    const afterReach = findEnclosedRegionsAdjacentTo(tile, tiles, "player-1", isInReach, {
      now: 1500,
      cooldownMs: 3000,
      originCooldownUntil
    });
    expect(afterReach.length).toBe(1);
    expect(afterReach[0]).toEqual(new Set([simulationTileKey(1, 2)]));
  });
});

describe("applyAutoFill reach gating", () => {
  it("does not auto-fill anything when even one sealing wall is outside reach, even though the interior tiles themselves are", () => {
    // Every tile here is "in reach" except the (3,1) wall. Even though the
    // whole interior is technically within reach, the seal itself isn't fully
    // backed by reach — the pocket doesn't count as enclosed yet, and nothing
    // is claimed until reach reaches (3,1) too.
    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(2, 0), ownedTile(2, 0, "player-1")],
      [simulationTileKey(2, 2), ownedTile(2, 2, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)],
      [simulationTileKey(2, 1), landTile(2, 1)]
    ]);
    const isInReach = (x: number, y: number): boolean => !(x === 3 && y === 1);

    const replacedTiles = new Map<string, DomainTileState>();
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: (k, tile) => replacedTiles.set(k, tile),
      isInReach
    });

    expect(settled).toEqual([]);
    expect(replacedTiles.size).toBe(0);
  });

  it("still leaves an individual unowned interior tile unclaimed if it alone falls outside reach, even though every wall does not", () => {
    // Every wall (and the OTHER interior tile) passes isInReach, so the BFS
    // itself successfully seals the pocket — but (2,1) specifically is carved
    // out of reach by the predicate. A real reach disk can't produce this
    // exact shape, but the per-tile claim check in applyAutoFill is a
    // deliberate belt-and-suspenders guard independent of the BFS wall gate,
    // and this proves it still works on its own.
    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(2, 0), ownedTile(2, 0, "player-1")],
      [simulationTileKey(2, 2), ownedTile(2, 2, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)],
      [simulationTileKey(2, 1), landTile(2, 1)]
    ]);
    const isInReach = (x: number, y: number): boolean => !(x === 2 && y === 1);

    const replacedTiles = new Map<string, DomainTileState>();
    const anchorBatches: string[][] = [];
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: (k, tile) => replacedTiles.set(k, tile),
      isInReach,
      recordYieldAnchors: (keys) => anchorBatches.push([...keys])
    });

    expect(settled.map((t) => simulationTileKey(t.x, t.y))).toEqual([simulationTileKey(1, 1)]);
    expect(replacedTiles.has(simulationTileKey(2, 1))).toBe(false);
    expect(anchorBatches).toEqual([[simulationTileKey(1, 1)]]);
  });

  it("still leaves the owner's own FRONTIER tile unclaimed if it alone falls outside reach", () => {
    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(1, 1), ownedTile(1, 1, "player-1", { ownershipState: "FRONTIER" })]
    ]);
    // Every wall (0,1)/(1,0)/(1,2)/(2,1) is in reach; only the FRONTIER
    // interior tile itself is carved out.
    const isInReach = (x: number, y: number): boolean => !(x === 1 && y === 1);

    const replacedTiles = new Map<string, DomainTileState>();
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: (k, tile) => replacedTiles.set(k, tile),
      isInReach
    });

    expect(settled).toEqual([]);
    expect(replacedTiles.size).toBe(0);
  });

  it("fills nothing and skips the yield-anchor callback when the whole region is out of reach", () => {
    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);

    let anchorsCalled = false;
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: () => { throw new Error("should not replace any tile"); },
      isInReach: () => false,
      recordYieldAnchors: () => { anchorsCalled = true; }
    });

    expect(settled).toEqual([]);
    expect(anchorsCalled).toBe(false);
  });
});
