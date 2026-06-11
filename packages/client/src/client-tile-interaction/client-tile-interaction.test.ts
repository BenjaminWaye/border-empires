import { describe, expect, it } from "vitest";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";

describe("neutralTileClickOutcome", () => {
  it("queues adjacent neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: true,
        isNeutral: true
      })
    ).toBe("queue-adjacent-neutral");
  });

  it("opens the menu for non-adjacent visible neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: true
      })
    ).toBe("open-menu");
  });

  it("opens the menu for enemy land with a reachable attack or crystal path", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: false
      })
    ).toBe("open-menu");
  });

  it("opens the menu for unreachable visible enemy land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: false
      })
    ).toBe("open-menu");
  });
});
