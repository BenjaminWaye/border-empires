import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import type { TechInfo } from "../client-types.js";
import {
  BLACKWOOD_SWIRL_ACTIVE_S,
  BLACKWOOD_SWIRL_PERIOD_S,
  blackwoodSwirlPhaseS,
  blackwoodSwirlProgress,
  prospectClueOverviewLine,
  prospectCluePropCount,
  prospectClueResourceLabel,
  prospectClueShownOnTile,
  retiredProspectClues
} from "./client-prospect-clue.js";

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
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY", resource: "FARM" }), true)).toBe(false);
    // Blackwood's swirl only rises from forest: open ground shows nothing.
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY" }), false)).toBe(false);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "BLACKWOOD_CANOPY" }), true)).toBe(true);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND" }), false)).toBe(true);
    // Neither renderer decorates remembered land.
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND", fogged: true }), false)).toBe(false);
  });

  // Review finding: the old multiply-xor hash made `% 2` depend only on
  // (wx ^ wy) parity, so 1-or-2 counts laid out as a strict checkerboard.
  it("does not lay prop counts out as a checkerboard", () => {
    let parityMatches = 0;
    let samples = 0;
    for (let wx = 0; wx < 30; wx += 1) {
      for (let wy = 0; wy < 30; wy += 1) {
        samples += 1;
        if ((prospectCluePropCount("REFRACTIVE_GROUND", wx, wy) === 2) === (((wx ^ wy) & 1) === 0)) parityMatches += 1;
      }
    }
    expect(parityMatches / samples).toBeGreaterThan(0.3);
    expect(parityMatches / samples).toBeLessThan(0.7);
  });

  // Once a resource is revealed the deposits show on the map, so its clue retires.
  it("retires a clue once its resource is revealed", () => {
    const catalog = [{ id: "survey", effects: { revealResource: "titanium" } }] as unknown as TechInfo[];
    const retired = retiredProspectClues(["survey"], catalog);
    expect([...retired]).toEqual(["FERROUS_DUST"]);
    expect(retiredProspectClues([], catalog).size).toBe(0);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "FERROUS_DUST" }), false, retired)).toBe(false);
    expect(prospectClueShownOnTile(tile({ prospectSignature: "REFRACTIVE_GROUND" }), false, retired)).toBe(true);
  });

  it("swirls each blackwood tile once per period, for the active window", () => {
    const start = BLACKWOOD_SWIRL_PERIOD_S * 10 - blackwoodSwirlPhaseS(7, 3);
    expect(blackwoodSwirlProgress(7, 3, start + 0.01)).toBeCloseTo(0.01 / BLACKWOOD_SWIRL_ACTIVE_S, 3);
    expect(blackwoodSwirlProgress(7, 3, start + BLACKWOOD_SWIRL_ACTIVE_S + 0.1)).toBeUndefined();
    expect(blackwoodSwirlProgress(7, 3, start + BLACKWOOD_SWIRL_PERIOD_S + 0.01)).toBeCloseTo(0.01 / BLACKWOOD_SWIRL_ACTIVE_S, 3);
  });
});
