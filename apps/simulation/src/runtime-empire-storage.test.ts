import { describe, expect, test } from "vitest";

import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { computeEmpireStorageCap, EMPIRE_STORAGE_FLOOR } from "./runtime-empire-storage.js";

describe("computeEmpireStorageCap", () => {
  test("SHARD has no storage cap regardless of production", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const zeroCap = computeEmpireStorageCap(summary, 0, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
    expect(zeroCap.SHARD).toBe(Number.MAX_SAFE_INTEGER);

    const producingCap = computeEmpireStorageCap(summary, 0, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 5 });
    expect(producingCap.SHARD).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("GOLD and FOOD still fall back to their floors when production is zero", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cap = computeEmpireStorageCap(summary, 0, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
    expect(cap.GOLD).toBe(EMPIRE_STORAGE_FLOOR.GOLD);
    expect(cap.FOOD).toBe(EMPIRE_STORAGE_FLOOR.FOOD);
  });
});
