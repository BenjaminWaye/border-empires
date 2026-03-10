import { describe, expect, test } from "vitest";
import { computeOwnershipChangeDelta, recomputeExposureForPlayer, type Tile } from "../src/index.js";

const key = (x: number, y: number): string => `${x},${y}`;

describe("exposure delta", () => {
  test("matches full recompute on capture", () => {
    const tiles = new Map<string, Tile>();

    const setTile = (tile: Tile): void => {
      tiles.set(key(tile.x, tile.y), tile);
    };

    setTile({ x: 10, y: 10, terrain: "LAND", ownerId: "A", lastChangedAt: 0 });
    setTile({ x: 11, y: 10, terrain: "LAND", ownerId: "B", lastChangedAt: 0 });
    setTile({ x: 10, y: 9, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });
    setTile({ x: 10, y: 11, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });
    setTile({ x: 9, y: 10, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });
    setTile({ x: 11, y: 9, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });
    setTile({ x: 11, y: 11, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });
    setTile({ x: 12, y: 10, terrain: "LAND", ownerId: undefined, lastChangedAt: 0 });

    const getTile = (x: number, y: number): Tile => {
      return tiles.get(key(x, y)) ?? { x, y, terrain: "SEA", ownerId: undefined, lastChangedAt: 0 };
    };

    const isAlly = () => false;

    const beforeA = recomputeExposureForPlayer("A", [...tiles.values()], getTile, isAlly);
    const beforeB = recomputeExposureForPlayer("B", [...tiles.values()], getTile, isAlly);

    const delta = computeOwnershipChangeDelta(11, 10, "B", "A", getTile, isAlly);
    setTile({ x: 11, y: 10, terrain: "LAND", ownerId: "A", lastChangedAt: 1 });

    const afterA = recomputeExposureForPlayer("A", [...tiles.values()], getTile, isAlly);
    const afterB = recomputeExposureForPlayer("B", [...tiles.values()], getTile, isAlly);

    const dA = delta.deltaByPlayer.get("A") ?? { dT: 0, dE: 0 };
    const dB = delta.deltaByPlayer.get("B") ?? { dT: 0, dE: 0 };

    expect(beforeA.T + dA.dT).toBe(afterA.T);
    expect(beforeA.E + dA.dE).toBe(afterA.E);
    expect(beforeB.T + dB.dT).toBe(afterB.T);
    expect(beforeB.E + dB.dE).toBe(afterB.E);
  });
});
