import { describe, expect, it } from "vitest";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";

describe("neutralTileClickOutcome", () => {
  it("queues adjacent neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        isOwnedByEnemy: false,
        isOwnedByAlly: false,
        hasAdjacentOwnedOrigin: true,
        hasFrontierOrigin: true,
        hasDock: false,
        isNeutral: true
      })
    ).toBe("queue-adjacent-neutral");
  });

  it("opens the menu for non-adjacent visible neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        isOwnedByEnemy: false,
        isOwnedByAlly: false,
        hasAdjacentOwnedOrigin: false,
        hasFrontierOrigin: false,
        hasDock: false,
        isNeutral: true
      })
    ).toBe("open-menu");
  });

  it("opens the menu for enemy land with a reachable attack or crystal path", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        isOwnedByEnemy: true,
        isOwnedByAlly: false,
        hasAdjacentOwnedOrigin: true,
        hasFrontierOrigin: false,
        hasDock: false,
        isNeutral: false
      })
    ).toBe("open-menu");
  });

  it("warns only for unreachable enemy land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        isOwnedByEnemy: true,
        isOwnedByAlly: false,
        hasAdjacentOwnedOrigin: false,
        hasFrontierOrigin: false,
        hasDock: false,
        isNeutral: false
      })
    ).toBe("warn-unreachable-enemy");
  });
});
