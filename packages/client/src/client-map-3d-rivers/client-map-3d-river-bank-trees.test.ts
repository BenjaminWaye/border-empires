import { describe, expect, it } from "vitest";
import { riverEdgeKey } from "@border-empires/shared";
import { LAYOUTS } from "../client-map-3d-forest.js";
import { riverBankTreeFilter } from "./client-map-3d-river-bank-trees.js";
import { RIVER_BANK_REACH } from "./client-map-3d-rivers-channel.js";

describe("trees stay out of river banks", () => {
  it("drops only trees within the bank reach of the tile's river border", () => {
    // Regression: tree layouts reach ~0.14 from the border, so trees beside
    // a river stood in its water.
    const edges = new Set([riverEdgeKey(10, 20, "H")]); // river on tile (10, 20)'s top border
    const inBank = riverBankTreeFilter(10, 20, edges);
    expect(inBank).not.toBeNull();
    for (const layout of LAYOUTS) {
      for (const tree of layout) {
        const distToTopBorder = tree.oz + 0.5;
        expect(inBank!(tree.ox, tree.oz)).toBe(distToTopBorder < RIVER_BANK_REACH);
      }
    }
    // At least one real layout tree is actually removed.
    expect(LAYOUTS.flat().some((t) => inBank!(t.ox, t.oz))).toBe(true);
  });

  it("returns null (no per-tree cost) for tiles without river borders or seasons without edge rivers", () => {
    expect(riverBankTreeFilter(10, 20, new Set([riverEdgeKey(40, 40, "V")]))).toBeNull();
    expect(riverBankTreeFilter(10, 20, new Set())).toBeNull();
  });
});
