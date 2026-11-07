import { describe, expect, it } from "vitest";
import { battlePresentationFor, battleClashMs } from "./battle-presentation.js";

describe("cosmetic battle endings", () => {
  it.each([
    [0.1, true, "comeback"], [0.9, false, "comeback"], [0.85, false, "comeback"],
    [0.1, false, "last-stand"], [0.9, true, "decisive"],
    [0.3, false, "contested"], [0.5, true, "contested"],
    [0, true, "contested"], [1, false, "contested"],
    [undefined, true, "contested"], [NaN, false, "contested"], [2, true, "contested"]
  ] as const)("classifies odds %s and attackerWon %s as %s", (odds, won, expected) => {
    expect(battlePresentationFor(odds, won)).toBe(expected);
  });
  it("retains old-server timing without a category and bounds the longest ending", () => {
    expect(battleClashMs(undefined)).toBe(1300);
    expect(battleClashMs("comeback")).toBe(4200);
  });
});
