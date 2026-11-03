import { describe, expect, test } from "vitest";

import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { computeEmpireStorageCap, EMPIRE_STORAGE_FLOOR } from "./runtime-empire-storage.js";

describe("computeEmpireStorageCap", () => {
  // Replenishment update (docs/replenishment-update-plan.md D4): gold has no
  // storage cap any more — production
  // level (or its absence) no longer matters for GOLD at all.
  test("GOLD has no storage cap regardless of income", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(cap.GOLD).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("FOOD still falls back to its floor when production is zero", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(cap.FOOD).toBe(EMPIRE_STORAGE_FLOOR.FOOD);
  });
});
