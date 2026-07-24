import { describe, expect, test } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildPlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";

const PLAYER = "player-1";

const tile = (x: number, y: number, partial: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: PLAYER,
  ownershipState: "SETTLED",
  ...partial
});

const tilesMap = (tiles: DomainTileState[]): Map<string, DomainTileState> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("buildPlayerDefensibilityMetrics — localSupportScore", () => {
  test("a lone settled tile surrounded by unowned land scores 0 support", () => {
    const tiles = tilesMap([tile(10, 10)]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.localSupportScore).toBe(0);
  });

  test("a compact block scores higher on average than a lone tile, but corners/edges keep it below 1", () => {
    const block: DomainTileState[] = [];
    for (let x = 9; x <= 11; x += 1) {
      for (let y = 9; y <= 11; y += 1) {
        block.push(tile(x, y));
      }
    }
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tilesMap(block));
    expect(metrics.localSupportScore).toBeGreaterThan(0);
    expect(metrics.localSupportScore).toBeLessThan(1);
  });

  test("driving a wedge into a compact cluster drops the average support score", () => {
    // A 3x3 fully-owned block: every tile touching the center on all 4 sides.
    const block: DomainTileState[] = [];
    for (let x = 9; x <= 11; x += 1) {
      for (let y = 9; y <= 11; y += 1) {
        block.push(tile(x, y));
      }
    }
    const fullBlockTiles = tilesMap(block);
    const fullBlockMetrics = buildPlayerDefensibilityMetrics(PLAYER, fullBlockTiles);

    // Now capture the center tile (remove it from the player's ownership) —
    // simulating an enemy wedge. Every neighbour of the center loses a
    // friendly-neighbour side, so the average score should drop.
    const wedgedBlock = block
      .filter((t) => !(t.x === 10 && t.y === 10))
      .concat([{ ...tile(10, 10), ownerId: "enemy", ownershipState: "SETTLED" }]);
    const wedgedTiles = tilesMap(wedgedBlock);
    const wedgedMetrics = buildPlayerDefensibilityMetrics(PLAYER, wedgedTiles);

    expect(wedgedMetrics.localSupportScore).toBeLessThan(fullBlockMetrics.localSupportScore);
  });

  test("an active fort raises a tile's support even with zero friendly neighbours", () => {
    const noFort = tilesMap([tile(10, 10)]);
    const withFort = tilesMap([
      tile(10, 10, { fort: { ownerId: PLAYER, status: "active", variant: "THUNDER_BASTION" } })
    ]);
    const noFortMetrics = buildPlayerDefensibilityMetrics(PLAYER, noFort);
    const withFortMetrics = buildPlayerDefensibilityMetrics(PLAYER, withFort);
    expect(withFortMetrics.localSupportScore).toBeGreaterThan(noFortMetrics.localSupportScore);
    // THUNDER_BASTION alone fully secures an otherwise-unsupported tile.
    expect(withFortMetrics.localSupportScore).toBe(1);
  });

  test("an inactive/under-construction fort contributes no garrison bonus", () => {
    const tiles = tilesMap([
      tile(10, 10, { fort: { ownerId: PLAYER, status: "under_construction", variant: "THUNDER_BASTION" } })
    ]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.localSupportScore).toBe(0);
  });

  test("a town on the tile gives a modest garrison bonus, less than a full fort", () => {
    const withTown = tilesMap([
      tile(10, 10, { town: { type: "FARMING", populationTier: "TOWN", name: "Town", supportMax: 3, supportCurrent: 1 } })
    ]);
    const withFort = tilesMap([
      tile(10, 10, { fort: { ownerId: PLAYER, status: "active", variant: "THUNDER_BASTION" } })
    ]);
    const townMetrics = buildPlayerDefensibilityMetrics(PLAYER, withTown);
    const fortMetrics = buildPlayerDefensibilityMetrics(PLAYER, withFort);
    expect(townMetrics.localSupportScore).toBeGreaterThan(0);
    expect(townMetrics.localSupportScore).toBeLessThan(fortMetrics.localSupportScore);
  });

  test("a fresh empire with no settled tiles defaults to full integrity (1), not 0", () => {
    const tiles = tilesMap([tile(10, 10, { ownershipState: "FRONTIER" })]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.localSupportScore).toBe(1);
  });

  test("water/mountain-backed tiles do not count as exposed (matches existing exposedEdgesFor convention)", () => {
    const tiles = tilesMap([
      tile(10, 10),
      tile(10, 9, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" }),
      tile(11, 10, { ownerId: undefined, ownershipState: undefined, terrain: "MOUNTAIN" }),
      tile(10, 11, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" }),
      tile(9, 10, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" })
    ]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.localSupportScore).toBe(1);
  });

  test("T/E/Ts/Es fields are unchanged in shape (existing consumers keep working)", () => {
    const tiles = tilesMap([tile(10, 10)]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.T).toBe(1);
    expect(metrics.Ts).toBe(1);
    expect(typeof metrics.E).toBe("number");
    expect(typeof metrics.Es).toBe("number");
  });
});
