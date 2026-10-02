import { describe, expect, test } from "vitest";

import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { computeEmpireStorageCap, EMPIRE_STORAGE_FLOOR } from "./runtime-empire-storage.js";

describe("computeEmpireStorageCap", () => {
  test("SHARD has no storage cap regardless of production", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const zeroCap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
    expect(zeroCap.SHARD).toBe(Number.MAX_SAFE_INTEGER);

    const producingCap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 5 });
    expect(producingCap.SHARD).toBe(Number.MAX_SAFE_INTEGER);
  });

  // Replenishment update (docs/replenishment-update-plan.md D4): gold has no
  // storage cap any more, same exemption SHARD already had — production
  // level (or its absence) no longer matters for GOLD at all.
  test("GOLD has no storage cap regardless of income", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
    expect(cap.GOLD).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("FOOD still falls back to its floor when production is zero", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cap = computeEmpireStorageCap(summary, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
    expect(cap.FOOD).toBe(EMPIRE_STORAGE_FLOOR.FOOD);
  });
});
