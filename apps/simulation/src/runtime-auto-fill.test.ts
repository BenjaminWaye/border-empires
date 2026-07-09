import { afterEach, describe, expect, it, vi } from "vitest";
import { findEnclosedRegion, findEnclosedRegionsAdjacentTo } from "./runtime-auto-fill.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";

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

describe("findEnclosedRegion", () => {
  it("returns null for a tile that can reach the map boundary", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 0), landTile(1, 0)]
    ]);
    expect(findEnclosedRegion(simulationTileKey(1, 0), tiles, "player-1")).toBeNull();
  });

  it("returns null for an already-owned origin tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 1), ownedTile(1, 1, "player-1")]
    ]);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("returns null for a non-LAND origin tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 1), { x: 1, y: 1, terrain: "SEA" }]
    ]);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("returns null if region size exceeds AUTO_FILL_MAX_REGION_SIZE", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let x = 0; x < 600; x += 1) {
      tiles.set(simulationTileKey(x, 1), landTile(x, 1));
    }
    tiles.set(simulationTileKey(599, 1), ownedTile(599, 1, "player-1"));
    tiles.set(simulationTileKey(0, 1), ownedTile(0, 1, "player-1"));
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("returns a 1-tile set for a single unowned tile enclosed on all 4 sides by player tiles", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(1);
    expect(region!.has(simulationTileKey(1, 1))).toBe(true);
  });

  it("returns a 4-tile set for a 2x2 pocket enclosed by player tiles", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(2, 0), ownedTile(2, 0, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      [simulationTileKey(0, 2), ownedTile(0, 2, "player-1")],
      [simulationTileKey(3, 2), ownedTile(3, 2, "player-1")],
      [simulationTileKey(1, 3), ownedTile(1, 3, "player-1")],
      [simulationTileKey(2, 3), ownedTile(2, 3, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)],
      [simulationTileKey(2, 1), landTile(2, 1)],
      [simulationTileKey(1, 2), landTile(1, 2)],
      [simulationTileKey(2, 2), landTile(2, 2)]
    ]);
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(4);
  });

  it("treats sea tiles as walls for a small pocket (sea + player tiles)", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), { x: 2, y: 1, terrain: "SEA" }],
      [simulationTileKey(1, 2), { x: 1, y: 2, terrain: "SEA" }],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(1);
  });

  it("returns null when an enemy tile forms part of the boundary", () => {
    // Three sides are player-1, the fourth is an enemy tile. The pocket is NOT
    // enclosed by *your* territory, so it must be left for manual play rather
    // than auto-claimed off the back of an enemy's wall.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "enemy-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("treats the player's own FRONTIER as transparent interior, not a wall", () => {
    // FRONTIER can still decay back to unowned, so it isn't a permanent seal.
    // The flood traverses *through* the frontier tile at (2,1) rather than
    // stopping at it — and beyond it lies an enemy tile at (3,1), so the region
    // leaks into enemy territory and returns null. If frontier were a wall the
    // enemy tile would never be reached and a 1-tile region would resolve.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1", { ownershipState: "FRONTIER" })],
      [simulationTileKey(3, 1), ownedTile(3, 1, "enemy-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("traverses through an interior FRONTIER tile when the region is still sealed by SETTLED", () => {
    // (1,1) unowned land and (2,1) our own FRONTIER form the interior; the whole
    // thing is ringed by our SETTLED tiles. The frontier is walked through (and
    // included in the region set) but the region still resolves because settled
    // territory seals every outer edge.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(2, 0), ownedTile(2, 0, "player-1")],
      [simulationTileKey(2, 2), ownedTile(2, 2, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1", { ownershipState: "FRONTIER" })]
    ]);
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(2);
    expect(region!.has(simulationTileKey(2, 1))).toBe(true);
  });

  it("treats mountain tiles as walls for a small pocket (mountain + player tiles)", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), { x: 2, y: 1, terrain: "MOUNTAIN" }],
      [simulationTileKey(1, 2), { x: 1, y: 2, terrain: "MOUNTAIN" }],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(1);
  });

  it("caps a natural-barrier-sealed pocket at 50 tiles (51-tile sea-walled corridor returns null)", () => {
    // A 1-wide corridor of unowned land x=1..51 at y=1, capped by player tiles
    // at both ends and walled top/bottom by sea. 51 unowned tiles lean on the
    // sea to seal, exceeding the natural-barrier cap → not auto-claimed.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(52, 1), ownedTile(52, 1, "player-1")]
    ]);
    for (let x = 1; x <= 51; x += 1) {
      tiles.set(simulationTileKey(x, 1), landTile(x, 1));
      tiles.set(simulationTileKey(x, 0), { x, y: 0, terrain: "SEA" });
      tiles.set(simulationTileKey(x, 2), { x, y: 2, terrain: "SEA" });
    }
    expect(findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1")).toBeNull();
  });

  it("allows a pocket larger than 50 when sealed purely by the player's own SETTLED tiles", () => {
    // Same 1-wide corridor of 51 unowned tiles, but walled top/bottom by the
    // player's own settled tiles instead of sea — no natural barrier, so the
    // larger AUTO_FILL_MAX_REGION_SIZE cap applies and the region resolves.
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(52, 1), ownedTile(52, 1, "player-1")]
    ]);
    for (let x = 1; x <= 51; x += 1) {
      tiles.set(simulationTileKey(x, 1), landTile(x, 1));
      tiles.set(simulationTileKey(x, 0), ownedTile(x, 0, "player-1"));
      tiles.set(simulationTileKey(x, 2), ownedTile(x, 2, "player-1"));
    }
    const region = findEnclosedRegion(simulationTileKey(1, 1), tiles, "player-1");
    expect(region).not.toBeNull();
    expect(region!.size).toBe(51);
  });

  it("returns null when the region reaches the map boundary through unowned land", () => {
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 0), landTile(0, 0)],
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);
    expect(findEnclosedRegion(simulationTileKey(0, 0), tiles, "player-1")).toBeNull();
  });
});

describe("findEnclosedRegionsAdjacentTo", () => {
  it("returns empty array when no cardinal neighbors are unowned land", () => {
    const tile = ownedTile(5, 5, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(5, 5), tile]
    ]);
    expect(findEnclosedRegionsAdjacentTo(tile, tiles, "player-1")).toEqual([]);
  });

  it("deduplicates: two cardinal neighbors in the same region returned as one Set", () => {
    // 8-tile ring of unowned land surrounds the owned tile, enclosed by
    // player-1 tiles on the outer rim. All 4 cardinal neighbors are part
    // of the same connected ring — only one region should be returned.
    const tile = ownedTile(3, 3, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(3, 3), tile],
      // Outer ring: player-1 walls
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      [simulationTileKey(4, 1), ownedTile(4, 1, "player-1")],
      [simulationTileKey(1, 2), ownedTile(1, 2, "player-1")],
      [simulationTileKey(5, 2), ownedTile(5, 2, "player-1")],
      [simulationTileKey(1, 3), ownedTile(1, 3, "player-1")],
      [simulationTileKey(5, 3), ownedTile(5, 3, "player-1")],
      [simulationTileKey(1, 4), ownedTile(1, 4, "player-1")],
      [simulationTileKey(5, 4), ownedTile(5, 4, "player-1")],
      [simulationTileKey(2, 5), ownedTile(2, 5, "player-1")],
      [simulationTileKey(3, 5), ownedTile(3, 5, "player-1")],
      [simulationTileKey(4, 5), ownedTile(4, 5, "player-1")],
      // Inner ring: unowned land (the pocket)
      [simulationTileKey(2, 2), landTile(2, 2)],
      [simulationTileKey(3, 2), landTile(3, 2)],
      [simulationTileKey(4, 2), landTile(4, 2)],
      [simulationTileKey(2, 3), landTile(2, 3)],
      [simulationTileKey(4, 3), landTile(4, 3)],
      [simulationTileKey(2, 4), landTile(2, 4)],
      [simulationTileKey(3, 4), landTile(3, 4)],
      [simulationTileKey(4, 4), landTile(4, 4)],
    ]);
    const regions = findEnclosedRegionsAdjacentTo(tile, tiles, "player-1");
    expect(regions.length).toBe(1);
    expect(regions[0].size).toBe(8);
  });

  it("returns two separate Sets when two distinct enclosed pockets exist around the tile", () => {
    // Left pocket at (1,x) and right pocket at (3,x) separated by owned
    // tiles at (2,1) and (2,3) which prevent BFS from connecting them.
    const tile = ownedTile(2, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(2, 2), tile],
      // Left wall
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(0, 2), ownedTile(0, 2, "player-1")],
      [simulationTileKey(0, 3), ownedTile(0, 3, "player-1")],
      // Right wall
      [simulationTileKey(4, 1), ownedTile(4, 1, "player-1")],
      [simulationTileKey(4, 2), ownedTile(4, 2, "player-1")],
      [simulationTileKey(4, 3), ownedTile(4, 3, "player-1")],
      // Top separator between pockets
      [simulationTileKey(1, 1), ownedTile(1, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(3, 1), ownedTile(3, 1, "player-1")],
      // Bottom separator between pockets
      [simulationTileKey(1, 3), ownedTile(1, 3, "player-1")],
      [simulationTileKey(2, 3), ownedTile(2, 3, "player-1")],
      [simulationTileKey(3, 3), ownedTile(3, 3, "player-1")],
      // Left pocket (3 tiles)
      [simulationTileKey(1, 2), landTile(1, 2)],
      // Right pocket (1 tile)
      [simulationTileKey(3, 2), landTile(3, 2)],
    ]);
    const regions = findEnclosedRegionsAdjacentTo(tile, tiles, "player-1");
    expect(regions.length).toBe(2);
    expect(regions[0].size).toBe(1);
    expect(regions[1].size).toBe(1);
  });
});

describe("applyAutoFill yield-anchor stamping", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("invokes recordYieldAnchors once with every newly settled tile key (matching the settled keys)", async () => {
    // AUTO_FILL_ENABLED is read at config import time, so stub the env and load
    // a fresh module instance before exercising applyAutoFill.
    vi.stubEnv("AUTO_FILL_ENABLED", "true");
    vi.resetModules();
    const { applyAutoFill } = await import("./runtime-auto-fill.js");

    // (1,1) is unowned land walled by player-1 on three sides plus the
    // captured tile (1,2), so it is a 1-tile enclosed pocket.
    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);

    const replaced: string[] = [];
    const anchorBatches: string[][] = [];
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: (k) => replaced.push(k),
      recordYieldAnchors: (keys) => anchorBatches.push([...keys])
    });

    expect(settled.map((t) => simulationTileKey(t.x, t.y))).toEqual([simulationTileKey(1, 1)]);
    // Stamped in a single batch covering exactly the tiles that were replaced.
    expect(anchorBatches).toEqual([replaced]);
    expect(anchorBatches).toEqual([[simulationTileKey(1, 1)]]);
  });

  it("does nothing when AUTO_FILL_ENABLED is false", async () => {
    vi.stubEnv("AUTO_FILL_ENABLED", "false");
    vi.resetModules();
    const { applyAutoFill } = await import("./runtime-auto-fill.js");

    const capturedTile = ownedTile(1, 2, "player-1");
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), ownedTile(0, 1, "player-1")],
      [simulationTileKey(2, 1), ownedTile(2, 1, "player-1")],
      [simulationTileKey(1, 0), ownedTile(1, 0, "player-1")],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(1, 1), landTile(1, 1)]
    ]);

    const anchorBatches: string[][] = [];
    const settled = applyAutoFill({
      capturedTile,
      ownerId: "player-1",
      tiles,
      replaceTileState: () => {},
      recordYieldAnchors: (keys) => anchorBatches.push([...keys])
    });

    expect(settled).toEqual([]);
    expect(anchorBatches).toEqual([]);
  });
});
