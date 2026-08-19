import { describe, expect, it } from "vitest";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";

describe("neutralTileClickOutcome", () => {
  it("queues adjacent neutral land outside reach (no relay-beacon choice to show)", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: true,
        isNeutral: true,
        targetInReach: false
      })
    ).toBe("queue-adjacent-neutral");
  });

  it("opens the menu for adjacent neutral land inside reach, so the Build Relay Beacon choice is visible instead of silently auto-claiming", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: true,
        isNeutral: true,
        targetInReach: true
      })
    ).toBe("open-menu");
  });

  it("opens the menu for non-adjacent visible neutral land", () => {
    expect(
      neutralTileClickOutcome({
        isLand: true,
        isFogged: false,
        hasFrontierOrigin: false,
        isNeutral: true,
        targetInReach: false
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
        targetInReach: false
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
        targetInReach: false
      })
    ).toBe("open-menu");
  });
});
