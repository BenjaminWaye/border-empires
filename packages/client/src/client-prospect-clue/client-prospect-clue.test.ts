import { describe, expect, it } from "vitest";
import { prospectClueColor, prospectClueOverviewLine, prospectClueResourceLabel } from "./client-prospect-clue.js";

describe("client-prospect-clue", () => {
  it("names the resource each clue points at", () => {
    expect(prospectClueResourceLabel("FERROUS_DUST")).toBe("Titanium");
    expect(prospectClueResourceLabel("BLACKWOOD_CANOPY")).toBe("Umbrite");
    expect(prospectClueResourceLabel("REFRACTIVE_GROUND")).toBe("Crystal");
  });

  it("builds a tile-menu line only for clue tiles", () => {
    expect(prospectClueOverviewLine("FERROUS_DUST")).toBe("Ferrous dust: Titanium deposits are likely within a few tiles.");
    expect(prospectClueOverviewLine(undefined)).toBeUndefined();
  });

  it("gives every clue a distinct color", () => {
    const colors = new Set((["FERROUS_DUST", "BLACKWOOD_CANOPY", "REFRACTIVE_GROUND"] as const).map(prospectClueColor));
    expect(colors.size).toBe(3);
  });
});
