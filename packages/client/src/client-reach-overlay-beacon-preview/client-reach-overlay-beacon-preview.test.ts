import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { computeOutpostReachPreview } from "./client-reach-overlay-beacon-preview.js";

describe("computeOutpostReachPreview", () => {
  it("is the full radius-5 square without terrain data", () => {
    expect(computeOutpostReachPreview(20, 20).size).toBe(11 * 11);
  });

  it("is land-gated like real reach when given tiles: coastal water shows, land across it does not", () => {
    // A north-south strait at x = 22: real reach stops at the water's edge,
    // so the placement preview must not shade the far shore as new reach.
    const tiles = new Map<string, Pick<Tile, "terrain">>();
    for (let y = 10; y <= 30; y += 1) tiles.set(tileKey(22, y), { terrain: "SEA" });
    const preview = computeOutpostReachPreview(20, 20, tiles);
    expect(preview.has(tileKey(22, 20))).toBe(true); // coastal edge included
    expect(preview.has(tileKey(23, 20))).toBe(false); // far shore
    expect(preview.has(tileKey(25, 20))).toBe(false);
    expect(preview.has(tileKey(15, 20))).toBe(true); // own side untouched
  });
});
