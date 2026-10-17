import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { prospectClueOverviewLine, prospectClueResourceLabel, prospectClueShownOnTile } from "./client-prospect-clue.js";

const tile = (extra: Partial<Tile> = {}): Tile => ({ x: 1, y: 1, terrain: "LAND", ...extra });

describe("client-prospect-clue", () => {
  it("names the resource each clue points at", () => {
    expect(prospectClueResourceLabel("FERROUS_DUST")).toBe("Titanium");
    expect(prospectClueResourceLabel("BLACKWOOD_CANOPY")).toBe("Umbrite");
    expect(prospectClueResourceLabel("REFRACTIVE_GROUND")).toBe("Crystal");
  });

  it("builds a tile-menu line only for clue tiles", () => {
    expect(prospectClueOverviewLine(tile({ prospectSignature: "FERROUS_DUST" }), false)).toBe("Ferrous dust: Titanium deposits are likely within a few tiles.");
    expect(prospectClueOverviewLine(tile(), true)).toBeUndefined();
  });

  // There is no ground tint any more, so a clue tile whose props are hidden
  // looks ordinary -- its tile-menu line must not appear out of nowhere.
  it("only counts a clue as shown where the map draws it", () => {
    expect(prospectClueShownOnTile(tile({ prospectSignature: "FERROUS_DUST", resource: "IRON" }), true)).toBe(false);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), false)).toBe(false);
    // Blackwood on a feature tile still shows through its own darkened trees.
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), true)).toBe(true);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND" }), false)).toBe(true);
  });
});
