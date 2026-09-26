import { describe, expect, it } from "vitest";
import type { RiverPath } from "@border-empires/shared";
import { key } from "./server-game-constants/server-game-constants.js";
import { riverAdjacentTilesFor } from "./server-worldgen-river-adjacent.js";

const byKey = (tiles: Array<{ x: number; y: number }>): string[] => tiles.map((t) => key(t.x, t.y)).sort();
const noShuffle = (): number => 0;

describe("riverAdjacentTilesFor", () => {
  it("v9 edge rivers: both tiles on either side of every river edge are river-adjacent", () => {
    // Corner (5,5) -> (6,5) -> (6,6): an east step along the border between
    // rows 4 and 5, then a south step along the border between columns 5 and 6.
    const path: RiverPath = [
      { wx: 5, wy: 5, halfWidth: 0.1 },
      { wx: 6, wy: 5, halfWidth: 0.1 },
      { wx: 6, wy: 6, halfWidth: 0.1 }
    ];
    expect(byKey(riverAdjacentTilesFor([path], true, noShuffle, key))).toEqual(byKey([
      { x: 5, y: 4 }, { x: 5, y: 5 }, // H edge
      { x: 6, y: 5 } // V edge: (5,5) and (6,5); (5,5) already counted
    ]));
  });

  it("v1-v8 centre rivers keep the original every-4th-point rounding", () => {
    const path: RiverPath = Array.from({ length: 9 }, (_, i) => ({ wx: 10.5 + i * 0.25, wy: 3.4, halfWidth: 0.1 }));
    expect(byKey(riverAdjacentTilesFor([path], false, noShuffle, key))).toEqual(byKey([
      { x: 11, y: 3 }, { x: 12, y: 3 }, { x: 13, y: 3 }
    ]));
  });
});
