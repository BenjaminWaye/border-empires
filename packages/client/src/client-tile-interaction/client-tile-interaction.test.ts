import { describe, expect, it } from "vitest";
import { neutralTileClickOutcome, tapClaimsAdjacentTile } from "./client-tile-interaction.js";

describe("neutralTileClickOutcome", () => {
  it("queues adjacent neutral land on a mouse click", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: true,
        isNeutral: true,
        tapInput: "mouse"
      })
    ).toBe("queue-adjacent-neutral");
  });

  it("opens the menu for non-adjacent visible neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: true,
        tapInput: "mouse"
      })
    ).toBe("open-menu");
  });

  it("opens the menu for enemy land with a reachable attack or crystal path", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: false,
        tapInput: "mouse"
      })
    ).toBe("open-menu");
  });

  it("opens the menu for unreachable visible enemy land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: false,
        tapInput: "mouse"
      })
    ).toBe("open-menu");
  });

  // Playtest 2026-11-12 (pt-optimiser, pt-oldphone): a tap meant to inspect a
  // tile next to the border expanded into it with no confirm.
  it("opens the sheet instead of claiming when adjacent neutral land is tapped on a touch screen", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: true,
        isNeutral: true,
        tapInput: "touch"
      })
    ).toBe("open-menu");
  });
});

describe("tapClaimsAdjacentTile", () => {
  it("claims straight away only for a mouse click (fogged and unexplored taps go through this too)", () => {
    expect(tapClaimsAdjacentTile("mouse")).toBe(true);
    expect(tapClaimsAdjacentTile("touch")).toBe(false);
  });
});
