import { describe, expect, it } from "vitest";
import { hasQueuedSettlementForTile, queuedSettlementOrderForTile } from "./client-development-queue.js";

describe("development queue helpers", () => {
  it("finds the ordinal for queued settlements without counting builds separately", () => {
    const queue = [
      { kind: "BUILD" as const, tileKey: "1,1" },
      { kind: "SETTLE" as const, tileKey: "2,2" },
      { kind: "SETTLE" as const, tileKey: "3,3" }
    ];
    expect(queuedSettlementOrderForTile(queue, "2,2")).toBe(1);
    expect(queuedSettlementOrderForTile(queue, "3,3")).toBe(2);
  });

  it("detects whether a tile already has a queued settlement", () => {
    const queue = [
      { kind: "BUILD" as const, tileKey: "1,1" },
      { kind: "SETTLE" as const, tileKey: "2,2" }
    ];
    expect(hasQueuedSettlementForTile(queue, "2,2")).toBe(true);
    expect(hasQueuedSettlementForTile(queue, "9,9")).toBe(false);
  });
});
