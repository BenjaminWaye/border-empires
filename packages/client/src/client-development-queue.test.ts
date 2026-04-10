import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "./client-state.js";
import { busyDevelopmentProcessCount, hasQueuedSettlementForTile, queuedSettlementOrderForTile } from "./client-development-queue.js";
import { developmentSlotSummary, processDevelopmentQueue, requestSettlement } from "./client-queue-logic.js";

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

  it("dispatches only one queued settlement until the server acknowledges development counts", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 0;
    state.developmentQueue = [
      { kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" },
      { kind: "SETTLE", x: 3, y: 3, tileKey: "3,3", label: "Settlement at (3, 3)" }
    ];

    const requestSettlement = vi.fn(() => {
      state.queuedDevelopmentDispatchPending = true;
      return true;
    });
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    const ws = { readyState: 1, OPEN: 1 } as WebSocket;

    expect(
      processDevelopmentQueue(state, {
        ws,
        authSessionReady: true,
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        requestSettlement,
        sendDevelopmentBuild: vi.fn(() => true),
        applyOptimisticStructureBuild: vi.fn(),
        applyOptimisticStructureRemoval: vi.fn(),
        pushFeed,
        renderHud
      })
    ).toBe(true);
    expect(requestSettlement).toHaveBeenCalledTimes(1);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 3, y: 3, tileKey: "3,3", label: "Settlement at (3, 3)" }]);

    expect(
      processDevelopmentQueue(state, {
        ws,
        authSessionReady: true,
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        requestSettlement,
        sendDevelopmentBuild: vi.fn(() => true),
        applyOptimisticStructureBuild: vi.fn(),
        applyOptimisticStructureRemoval: vi.fn(),
        pushFeed,
        renderHud
      })
    ).toBe(false);
    expect(requestSettlement).toHaveBeenCalledTimes(1);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 3, y: 3, tileKey: "3,3", label: "Settlement at (3, 3)" }]);
  });

  it("queues a settlement instead of sending it while the target tile is still in flight", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.actionInFlight = true;
    state.actionTargetKey = "2,2";
    state.tiles.set("2,2", {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } as any);
    const pushFeed = vi.fn();
    const renderHud = vi.fn();

    const queued = requestSettlement(state, 2, 2, {
      keyFor: (x, y) => `${x},${y}`,
      developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
      developmentSlotReason: () => "busy",
      queueDevelopmentAction: (entry) => {
        state.developmentQueue.push(entry);
        return true;
      },
      pushFeed,
      renderHud,
      sendGameMessage: vi.fn(() => true),
      syncOptimisticSettlementTile: vi.fn(),
      opts: {}
    });

    expect(queued).toBe(true);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }]);
    expect(state.settleProgressByTile.size).toBe(0);
  });

  it("keeps a queued settlement waiting while the tile is still syncing from combat", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 0;
    state.actionInFlight = true;
    state.actionTargetKey = "2,2";
    state.developmentQueue = [{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }];
    const requestSettlementSpy = vi.fn(() => true);
    const ws = { readyState: 1, OPEN: 1 } as WebSocket;

    expect(
      processDevelopmentQueue(state, {
        ws,
        authSessionReady: true,
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        requestSettlement: requestSettlementSpy,
        sendDevelopmentBuild: vi.fn(() => true),
        applyOptimisticStructureBuild: vi.fn(),
        applyOptimisticStructureRemoval: vi.fn(),
        pushFeed: vi.fn(),
        renderHud: vi.fn()
      })
    ).toBe(false);
    expect(requestSettlementSpy).not.toHaveBeenCalled();
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }]);
  });
});
