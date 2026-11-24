import { describe, expect, it, test } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { empireIntegrity } from "@border-empires/shared";
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

describe("buildPlayerDefensibilityMetrics — T/E/Ts/Es", () => {
  test("water/mountain-backed tiles do not count as exposed (matches existing exposedEdgesFor convention)", () => {
    const tiles = tilesMap([
      tile(10, 10),
      tile(10, 9, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" }),
      tile(11, 10, { ownerId: undefined, ownershipState: undefined, terrain: "MOUNTAIN" }),
      tile(10, 11, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" }),
      tile(9, 10, { ownerId: undefined, ownershipState: undefined, terrain: "SEA" })
    ]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.Es).toBe(0);
  });

  test("T/E/Ts/Es fields are unchanged in shape (existing consumers keep working)", () => {
    const tiles = tilesMap([tile(10, 10)]);
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, tiles);
    expect(metrics.T).toBe(1);
    expect(metrics.Ts).toBe(1); // the one tile is garrisoned
    expect(typeof metrics.E).toBe("number");
    expect(typeof metrics.Es).toBe("number");
  });
});

const settled = (x: number, y: number, ownerId: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

const frontier = (x: number, y: number, ownerId: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER" });

const blockOf = (size: number, stateAt: (x: number, y: number) => DomainTileState): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let x = 0; x < size; x += 1) for (let y = 0; y < size; y += 1) tiles.set(`${x},${y}`, stateAt(x, y));
  return tiles;
};
const edge = (x: number, y: number, size: number): boolean => x === 0 || y === 0 || x === size - 1 || y === size - 1;

// Owner rule (Playtest Run 4 follow-up): Integrity is the shape of everything the player owns (open sides of all
// owned land), less a penalty under 10% garrisoned (empireIntegrity, packages/shared).
describe("buildPlayerDefensibilityMetrics — whole-territory shape and garrison share", () => {
  it("counts every owned tile, the garrisoned ones, and the sides facing land that isn't the player's", () => {
    const metrics = buildPlayerDefensibilityMetrics(PLAYER, blockOf(3, (x, y) => (x === 1 && y === 1 ? settled(x, y, PLAYER) : frontier(x, y, PLAYER))));
    expect(metrics).toEqual({ T: 9, E: 12, Ts: 1, Es: 12 });
  });

  // Regression: under the old rule garrisoning raised exposure, so it lowered Integrity.
  it("garrisoning, inside or on the border, never changes the shape and lifts the too-little-garrisoned penalty", () => {
    // 12x12 = 144 owned tiles: past the new-empire grace floor, so the score is the two parts alone.
    const allFrontier = buildPlayerDefensibilityMetrics(PLAYER, blockOf(12, (x, y) => frontier(x, y, PLAYER)));
    const coreGarrisoned = buildPlayerDefensibilityMetrics(PLAYER, blockOf(12, (x, y) => (edge(x, y, 12) ? frontier(x, y, PLAYER) : settled(x, y, PLAYER))));
    const borderGarrisoned = buildPlayerDefensibilityMetrics(PLAYER, blockOf(12, (x, y) => (edge(x, y, 12) || (x === 1 && y === 1) ? settled(x, y, PLAYER) : frontier(x, y, PLAYER))));
    for (const metrics of [coreGarrisoned, borderGarrisoned]) expect(metrics.Es).toBe(allFrontier.Es);
    const score = (m: typeof allFrontier) => empireIntegrity(m.T, m.Es, m.Ts);
    expect(score(allFrontier)).toBeCloseTo(0.7); // perfect square shape, nothing garrisoned: the full penalty
    expect(score(coreGarrisoned)).toBe(1);
    expect(score(borderGarrisoned)).toBe(1);
  });

  it("a frontier moat hides nothing: its outward sides count", () => {
    const moat = buildPlayerDefensibilityMetrics(PLAYER, blockOf(5, (x, y) => (edge(x, y, 5) ? frontier(x, y, PLAYER) : settled(x, y, PLAYER))));
    expect(moat.Es).toBe(20);
  });
});
