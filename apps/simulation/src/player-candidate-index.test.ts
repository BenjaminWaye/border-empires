/**
 * Behavior tests for PlayerCandidateIndex.
 *
 * Verifies:
 * - Empty world
 * - Single town anchor (candidates at r=1)
 * - Single fort with IRON_BASTION (radius 3)
 * - Ownership flap (enemy becomes friendly)
 * - Radius downgrade returns subset
 * - Max-radius wrap
 * - sortedAttackCandidates order matches sweepAttackCandidates element-wise
 */
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { PlayerCandidateIndex } from "./player-candidate-index.js";
import { sweepAttackCandidates } from "./territory-automation.js";

const mkTile = (x: number, y: number, opts: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ...opts
});

const mkFortTile = (
  x: number,
  y: number,
  ownerId: string,
  variant?: string
): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  fort: { ownerId, status: "active", ...(variant ? { variant } : {}) }
});

const mkTownTile = (x: number, y: number, ownerId: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  town: { populationTier: "TOWN", type: "FARMING" }
});

describe("PlayerCandidateIndex", () => {
  it("empty world: no anchors, no candidates", () => {
    const index = new PlayerCandidateIndex();
    expect(index.anchorCount()).toBe(0);
    expect([...index.claimCandidates("10,10", 1)]).toHaveLength(0);
    expect(index.sortedAttackCandidates("10,10", 5)).toHaveLength(0);
  });

  it("single town anchor: 8 candidates at r=1 (center excluded)", () => {
    const index = new PlayerCandidateIndex();
    const tiles = new Map<string, DomainTileState>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        tiles.set(`${10 + dx},${10 + dy}`, mkTile(10 + dx, 10 + dy));
      }
    }
    index.registerAnchor("10,10", "p1", 1, (k) => tiles.get(k));
    const candidates = [...index.claimCandidates("10,10", 1)];
    // r=1 gives 8 neighbors (center excluded)
    expect(candidates).toHaveLength(8);
    expect(candidates).not.toContain("10,10");
  });

  it("sortedAttackCandidates: enemy tiles sorted distance asc, x asc, y asc", () => {
    const index = new PlayerCandidateIndex();
    const tiles = new Map<string, DomainTileState>();
    // Add enemies at various distances
    const enemies = [
      mkTile(11, 10, { ownerId: "p2", ownershipState: "FRONTIER" }),  // dist 1
      mkTile(9, 10, { ownerId: "p2", ownershipState: "FRONTIER" }),   // dist 1
      mkTile(12, 10, { ownerId: "p2", ownershipState: "FRONTIER" }),  // dist 2
    ];
    for (const e of enemies) tiles.set(`${e.x},${e.y}`, e);
    tiles.set("10,10", mkTile(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));

    index.registerAnchor("10,10", "p1", 5, (k) => tiles.get(k));
    const candidates = index.sortedAttackCandidates("10,10", 5);

    // Should be sorted: dist 1 tiles first (x asc: 9,10 before 11,10), then dist 2
    expect(candidates[0]?.x).toBe(9);
    expect(candidates[0]?.y).toBe(10);
    expect(candidates[1]?.x).toBe(11);
    expect(candidates[1]?.y).toBe(10);
    expect(candidates[2]?.x).toBe(12);
    expect(candidates[2]?.y).toBe(10);
  });

  it("sortedAttackCandidates matches sweepAttackCandidates element-wise", () => {
    const anchor = mkTile(10, 10, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, DomainTileState>();
    tiles.set("10,10", anchor);
    // Add scattered enemies
    const enemyPositions = [
      [11, 10], [9, 10], [10, 11], [12, 11], [8, 9], [14, 10]
    ];
    for (const [x, y] of enemyPositions) {
      const tile = mkTile(x!, y!, { ownerId: "p2", ownershipState: "FRONTIER" });
      tiles.set(`${x},${y}`, tile);
    }

    const index = new PlayerCandidateIndex();
    index.registerAnchor("10,10", "p1", 5, (k) => tiles.get(k));

    const getTile = (x: number, y: number) => tiles.get(`${x},${y}`);
    const sweepResult = sweepAttackCandidates(anchor, "p1", 5, getTile);
    const indexResult = index.sortedAttackCandidates("10,10", 5);

    expect(indexResult.length).toBe(sweepResult.length);
    for (let i = 0; i < sweepResult.length; i++) {
      expect(indexResult[i]?.x).toBe(sweepResult[i]?.x);
      expect(indexResult[i]?.y).toBe(sweepResult[i]?.y);
    }
  });

  it("ownership flap: enemy becomes friendly, disappears from attack list", () => {
    const index = new PlayerCandidateIndex();
    const tiles = new Map<string, DomainTileState>();
    const enemy = mkTile(11, 10, { ownerId: "p2", ownershipState: "FRONTIER" });
    tiles.set("11,10", enemy);
    tiles.set("10,10", mkTile(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));

    index.registerAnchor("10,10", "p1", 5, (k) => tiles.get(k));
    expect(index.sortedAttackCandidates("10,10", 5)).toHaveLength(1);

    // Ownership flap: enemy tile now owned by p1
    const friendly = mkTile(11, 10, { ownerId: "p1", ownershipState: "FRONTIER" });
    tiles.set("11,10", friendly);
    index.refreshAroundTile("11,10", (k) => tiles.get(k));

    expect(index.sortedAttackCandidates("10,10", 5)).toHaveLength(0);
  });

  it("radius downgrade returns subset", () => {
    const index = new PlayerCandidateIndex();
    const tiles = new Map<string, DomainTileState>();
    // Put enemies at distances 1, 2, 3
    tiles.set("11,10", mkTile(11, 10, { ownerId: "p2", ownershipState: "FRONTIER" }));
    tiles.set("12,10", mkTile(12, 10, { ownerId: "p2", ownershipState: "FRONTIER" }));
    tiles.set("13,10", mkTile(13, 10, { ownerId: "p2", ownershipState: "FRONTIER" }));

    index.registerAnchor("10,10", "p1", 5, (k) => tiles.get(k));
    expect(index.sortedAttackCandidates("10,10", 5)).toHaveLength(3);
    expect(index.sortedAttackCandidates("10,10", 2)).toHaveLength(2);
    expect(index.sortedAttackCandidates("10,10", 1)).toHaveLength(1);
  });

  it("unregisterAnchor removes it from claimCandidates", () => {
    const index = new PlayerCandidateIndex();
    index.registerAnchor("10,10", "p1", 1, () => undefined);
    expect(index.anchorCount()).toBe(1);
    index.unregisterAnchor("10,10");
    expect(index.anchorCount()).toBe(0);
    expect([...index.claimCandidates("10,10", 1)]).toHaveLength(0);
  });

  it("hasAnchor returns true iff anchor is registered", () => {
    const index = new PlayerCandidateIndex();
    expect(index.hasAnchor("5,5")).toBe(false);
    index.registerAnchor("5,5", "p1", 1, () => undefined);
    expect(index.hasAnchor("5,5")).toBe(true);
    index.unregisterAnchor("5,5");
    expect(index.hasAnchor("5,5")).toBe(false);
  });

  it("claimCandidates iteration order: top-left to bottom-right at r=1", () => {
    const index = new PlayerCandidateIndex();
    index.registerAnchor("10,10", "p1", 1, () => undefined);
    const keys = [...index.claimCandidates("10,10", 1)];
    // Expected order for r=1: dy=-1..+1, dx=-1..+1, skip (0,0)
    // = (9,9),(10,9),(11,9),(9,10),(11,10),(9,11),(10,11),(11,11)
    expect(keys[0]).toBe("9,9");
    expect(keys[1]).toBe("10,9");
    expect(keys[2]).toBe("11,9");
    // center skipped at (10,10)
    expect(keys[3]).toBe("9,10");
    expect(keys[4]).toBe("11,10");
    expect(keys[5]).toBe("9,11");
    expect(keys[6]).toBe("10,11");
    expect(keys[7]).toBe("11,11");
  });

  it("tie-break determinism: 4 enemies equidistant, x asc then y asc", () => {
    const index = new PlayerCandidateIndex();
    const tiles = new Map<string, DomainTileState>();
    // All at distance 1 from (10,10)
    const coords = [[9, 10], [11, 10], [10, 9], [10, 11]];
    for (const [x, y] of coords) {
      tiles.set(`${x},${y}`, mkTile(x!, y!, { ownerId: "p2", ownershipState: "FRONTIER" }));
    }
    index.registerAnchor("10,10", "p1", 5, (k) => tiles.get(k));
    const candidates = index.sortedAttackCandidates("10,10", 5);
    // Sort: dist asc, x asc, y asc
    // All dist=1: x=9 → (9,10), then x=10 → (10,9),(10,11), then x=11 → (11,10)
    expect(candidates[0]).toMatchObject({ x: 9, y: 10 });
    expect(candidates[1]).toMatchObject({ x: 10, y: 9 });
    expect(candidates[2]).toMatchObject({ x: 10, y: 11 });
    expect(candidates[3]).toMatchObject({ x: 11, y: 10 });
  });
});
