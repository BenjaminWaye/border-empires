import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { prospectClueOverviewLine, prospectCluePropCount, prospectClueResourceLabel, prospectClueShownOnTile } from "./client-prospect-clue.js";

const tile = (extra: Partial<Tile> = {}): Tile => ({ x: 1, y: 1, terrain: "LAND", ...extra });

describe("client-prospect-clue", () => {
  it("names the resource each clue points at", () => {
    expect(prospectClueResourceLabel("FERROUS_DUST")).toBe("Titanium");
    expect(prospectClueResourceLabel("BLACKWOOD_CANOPY")).toBe("Umbrite");
    expect(prospectClueResourceLabel("REFRACTIVE_GROUND")).toBe("Crystal");
  });

  it("builds a tile-menu line only for clue tiles", () => {
    expect(prospectClueOverviewLine(tile({ prospectSignature: "FERROUS_DUST" }))).toBe("Ferrous dust: Titanium deposits are likely within a few tiles.");
    expect(prospectClueOverviewLine(tile())).toBeUndefined();
  });

  // There is no ground tint any more, so a clue tile whose props are hidden
  // looks ordinary -- its tile-menu line must not appear out of nowhere.
  it("only counts a clue as shown where the map draws it", () => {
    expect(prospectClueShownOnTile(tile({ prospectSignature: "FERROUS_DUST", resource: "IRON" }), true)).toBe(false);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), false)).toBe(false);
    // Blackwood on a feature tile still shows through its own darkened trees.
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), true)).toBe(true);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND" }), false)).toBe(true);
    // Neither renderer decorates remembered land.
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND", fogged: true }), false)).toBe(false);
  });

  // Review finding: the old multiply-xor hash made `% 2` depend only on
  // (wx ^ wy) parity, so 2-or-3 counts laid out as a strict checkerboard.
  it("does not lay prop counts out as a checkerboard", () => {
    let parityMatches = 0;
    let samples = 0;
    for (let wx = 0; wx < 30; wx += 1) {
      for (let wy = 0; wy < 30; wy += 1) {
        samples += 1;
        if ((prospectCluePropCount("BLACKWOOD_CANOPY", wx, wy) === 3) === (((wx ^ wy) & 1) === 0)) parityMatches += 1;
      }
    }
    expect(parityMatches / samples).toBeGreaterThan(0.3);
    expect(parityMatches / samples).toBeLessThan(0.7);
  });
});
