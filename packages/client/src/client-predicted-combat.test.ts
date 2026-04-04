import { describe, expect, it } from "vitest";

import { shouldFinalizePredictedCombat, wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";

describe("predicted combat helpers", () => {
  it("finalizes a predicted result when the local timer has ended", () => {
    expect(
      shouldFinalizePredictedCombat({
        now: 4_001,
        resolvesAt: 4_000,
        captureTargetKey: "40,239",
        revealTargetKey: "40,239",
        revealed: false,
        hasPredictedResult: true
      })
    ).toBe(true);
  });

  it("does not finalize before the timer ends", () => {
    expect(
      shouldFinalizePredictedCombat({
        now: 3_999,
        resolvesAt: 4_000,
        captureTargetKey: "40,239",
        revealTargetKey: "40,239",
        revealed: false,
        hasPredictedResult: true
      })
    ).toBe(false);
  });

  it("does not finalize when no predicted result was supplied", () => {
    expect(
      shouldFinalizePredictedCombat({
        now: 4_001,
        resolvesAt: 4_000,
        captureTargetKey: "40,239",
        revealTargetKey: "40,239",
        revealed: false,
        hasPredictedResult: false
      })
    ).toBe(false);
  });

  it("suppresses duplicate alerts when the confirmed result matches the predicted one", () => {
    const shown = new Map<string, { title: string; detail: string }>([["40,239", { title: "Victory", detail: "Dock was conquered from Enemy." }]]);

    expect(wasPredictedCombatAlreadyShown(shown, "40,239", "Victory", "Dock was conquered from Enemy.")).toBe(true);
    expect(wasPredictedCombatAlreadyShown(shown, "40,239", "Victory", "Town was conquered from Enemy.")).toBe(false);
  });
});
