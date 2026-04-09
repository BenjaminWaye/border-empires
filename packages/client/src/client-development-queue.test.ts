import { describe, expect, it } from "vitest";
import { createInitialState } from "./client-state.js";
import { busyDevelopmentProcessCount, hasQueuedSettlementForTile, queuedSettlementOrderForTile } from "./client-development-queue.js";
import { developmentSlotSummary } from "./client-queue-logic.js";

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

  it("counts removing structures as busy development processes", () => {
    const tiles = [
      { ownerId: "me", economicStructure: { status: "removing" } },
      { ownerId: "me", fort: { status: "removing" } },
      { ownerId: "me", observatory: { status: "removing" } },
      { ownerId: "me", siegeOutpost: { status: "removing" } },
      { ownerId: "other", observatory: { status: "under_construction" } }
    ];
    expect(busyDevelopmentProcessCount(tiles, "me", 1)).toBe(5);
  });

  it("uses the live development slot cap from player state", () => {
    const state = createInitialState();
    state.me = "me";
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 1;
    state.settleProgressByTile.set("2,2", { startAt: 0, resolvesAt: 10_000, target: { x: 2, y: 2 } });

    const summary = developmentSlotSummary(state, {
      busyDevelopmentProcessCount: (tiles, ownerId, activeSettlements) => {
        expect([...tiles]).toHaveLength(0);
        expect(ownerId).toBe("me");
        expect(activeSettlements).toBe(1);
        return 99;
      }
    });

    expect(summary).toEqual({ busy: 1, limit: 4, available: 3 });
  });

  it("falls back to the local tile scan when no authoritative busy count is available", () => {
    const state = createInitialState();
    state.me = "me";
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = undefined as unknown as number;
    state.settleProgressByTile.set("2,2", { startAt: 0, resolvesAt: 10_000, target: { x: 2, y: 2 } });

    const summary = developmentSlotSummary(state, {
      busyDevelopmentProcessCount: (tiles, ownerId, activeSettlements) => {
        expect([...tiles]).toHaveLength(0);
        expect(ownerId).toBe("me");
        expect(activeSettlements).toBe(1);
        return 2;
      }
    });

    expect(summary).toEqual({ busy: 2, limit: 4, available: 2 });
  });
});
