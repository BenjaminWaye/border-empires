import { describe, expect, it } from "vitest";
import { DRAW_WINDOW_MS, createMusterDrawLog, forgetMusterDrawsExcept, musterDrawnRecently, observeMusterSample } from "./client-muster-draw-log.js";

describe("muster draw log", () => {
  it("counts what each new server sample added, within the window", () => {
    const log = createMusterDrawLog();
    observeMusterSample(log, "1,1", { amount: 10, updatedAt: 1 }, 0);
    observeMusterSample(log, "1,1", { amount: 40, updatedAt: 2 }, 1_000);
    observeMusterSample(log, "1,1", { amount: 40, updatedAt: 2 }, 2_000); // same sample again
    observeMusterSample(log, "1,1", { amount: 5, updatedAt: 3 }, 3_000); // an attack spent from it
    observeMusterSample(log, "1,1", { amount: 25, updatedAt: 4 }, 4_000);
    expect(musterDrawnRecently(log, "1,1", 4_000)).toBe(50);
    expect(musterDrawnRecently(log, "1,1", 1_000 + DRAW_WINDOW_MS + 1)).toBe(20);
    expect(musterDrawnRecently(log, "1,1", 4_000 + DRAW_WINDOW_MS + 1)).toBe(0);
  });

  it("forgets flags that are gone and stays bounded", () => {
    const log = createMusterDrawLog();
    for (let i = 0; i < 100; i += 1) observeMusterSample(log, `${i},0`, { amount: 0, updatedAt: 0 }, 0);
    expect(log.size).toBe(64);
    forgetMusterDrawsExcept(log, new Set(["99,0"]));
    expect([...log.keys()]).toEqual(["99,0"]);
  });
});
