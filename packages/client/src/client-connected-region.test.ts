import { describe, expect, it } from "vitest";

import { connectedEnemyRegionKeys } from "./client-connected-region.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (n: number): number => ((n % 8) + 8) % 8;

const tile = (x: number, y: number, ownerId?: string, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...(ownerId ? { ownerId } : {}),
  ...overrides
});

describe("connectedEnemyRegionKeys", () => {
  it("collects the contiguous visible region for the selected enemy owner", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(2, 2), tile(2, 2, "enemy")],
      [keyFor(3, 2), tile(3, 2, "enemy")],
      [keyFor(3, 3), tile(3, 3, "enemy")],
      [keyFor(4, 2), tile(4, 2, "other-enemy")],
      [keyFor(2, 3), tile(2, 3, "enemy", { fogged: true })]
    ]);

    expect(
      connectedEnemyRegionKeys(
        { me: "me", tiles },
        tiles.get(keyFor(2, 2)),
        { keyFor, wrapX: wrap, wrapY: wrap }
      )
    ).toEqual([keyFor(2, 2), keyFor(3, 2), keyFor(3, 3)]);
  });

  it("follows map wrapping when the same enemy region crosses an edge", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(0, 5), tile(0, 5, "enemy")],
      [keyFor(7, 5), tile(7, 5, "enemy")],
      [keyFor(6, 5), tile(6, 5, "enemy")]
    ]);

    expect(
      connectedEnemyRegionKeys(
        { me: "me", tiles },
        tiles.get(keyFor(0, 5)),
        { keyFor, wrapX: wrap, wrapY: wrap }
      )
    ).toEqual([keyFor(0, 5), keyFor(6, 5), keyFor(7, 5)]);
  });

  it("returns no region for owned, neutral, or missing roots", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(1, 1), tile(1, 1, "me")],
      [keyFor(2, 2), tile(2, 2)]
    ]);

    expect(connectedEnemyRegionKeys({ me: "me", tiles }, tiles.get(keyFor(1, 1)), { keyFor, wrapX: wrap, wrapY: wrap })).toEqual([]);
    expect(connectedEnemyRegionKeys({ me: "me", tiles }, tiles.get(keyFor(2, 2)), { keyFor, wrapX: wrap, wrapY: wrap })).toEqual([]);
    expect(connectedEnemyRegionKeys({ me: "me", tiles }, undefined, { keyFor, wrapX: wrap, wrapY: wrap })).toEqual([]);
  });
});
