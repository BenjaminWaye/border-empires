import { describe, expect, it } from "vitest";
import { riverEdgeKey, WORLD_WIDTH } from "@border-empires/shared";
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
  it("also keeps trees out of the cove at a river mouth, even on a tile with no river border", () => {
    // Regression: the cove drops the land below the sea near a mouth corner,
    // and trees placed at the tile's ground height floated over it.
    const edges = new Set([riverEdgeKey(40, 40, "V")]); // some v9 river elsewhere
    const mouths = new Set([21 * WORLD_WIDTH + 11]); // mouth at tile (10, 20)'s bottom-right corner
    const inCove = riverBankTreeFilter(10, 20, edges, mouths);
    expect(inCove).not.toBeNull();
    expect(inCove!(0.36, 0.36)).toBe(true); // near that corner
    expect(inCove!(-0.36, -0.36)).toBe(false); // far corner
  });
  it("keeps trees out of the spring pool at a river head, even on a tile with no river border", () => {
    // Regression: the tile behind a river's first edge has no river border,
    // so its trees stood in the new spring pool.
    const edges = new Set([riverEdgeKey(40, 40, "V")]);
    const heads = new Set([20 * WORLD_WIDTH + 10]); // head at tile (10, 20)'s top-left corner
    const inPool = riverBankTreeFilter(10, 20, edges, new Set(), heads);
    expect(inPool).not.toBeNull();
    expect(inPool!(-0.36, -0.36)).toBe(true); // by that corner
    expect(inPool!(0.36, 0.36)).toBe(false); // far corner
  });
  it("keeps trees off a river mountain's cascade edge too", () => {
    const edges = new Set([riverEdgeKey(40, 40, "V")]);
    const cascades = new Set([riverEdgeKey(10, 20, "H")]); // cascade along tile (10, 20)'s top border
    const onCascade = riverBankTreeFilter(10, 20, edges, new Set(), new Set(), cascades);
    expect(onCascade).not.toBeNull();
    expect(onCascade!(0, -0.45)).toBe(true);
    expect(onCascade!(0, 0.3)).toBe(false);
  });
});
