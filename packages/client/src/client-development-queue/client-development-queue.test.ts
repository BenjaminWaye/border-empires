import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import {
  AUTO_SETTLEMENT_QUEUE_VISIBLE_MS,
  applyAutoSettlementQueueFromServer,
  busyDevelopmentProcessCount,
  hasQueuedSettlementForTile,
  persistDevelopmentQueueForPlayer,
  persistSkippedAutoSettlementTileKeysForPlayer,
  pruneExpiredAutoSettlementQueueVisibleHolds,
  queuedSettlementOrderForTile,
  restoreSkippedAutoSettlementTileKeysForPlayer,
  restorePersistedDevelopmentQueueForPlayer
} from "./client-development-queue.js";
import { cancelQueuedSettlement, developmentSlotSummary, processDevelopmentQueue, queueDevelopmentAction, requestSettlement, sendDevelopmentBuild } from "../client-queue-logic/client-queue-logic.js";
import type { TechInfo } from "../client-types.js";

const installSessionStorageMock = () => {
  let values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values = new Map<string, string>();
    }
  });
};

describe("development queue helpers", () => {
  it("persists and restores queued settlements for the same player session", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    persistDevelopmentQueueForPlayer("me", [{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }]);

    const restored = restorePersistedDevelopmentQueueForPlayer(
      "me",
      new Map([
        [
          "2,2",
          {
            ownerId: "me",
            ownershipState: "FRONTIER"
          }
        ]
      ])
    );

    expect(restored).toEqual([{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }]);
  });

  it("drops persisted settlements that are already pending on the server", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    persistDevelopmentQueueForPlayer("me", [{ kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }]);

    const restored = restorePersistedDevelopmentQueueForPlayer(
      "me",
      new Map([
        [
          "2,2",
          {
            ownerId: "me",
            ownershipState: "FRONTIER"
          }
        ]
      ]),
      new Set(["2,2"])
    );

    expect(restored).toEqual([]);
  });

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

  it("appends server-ordered auto settlements to the cancellable development queue", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    state.tiles.set("30,30", { x: 30, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    state.tiles.set("40,40", { x: 40, y: 40, terrain: "LAND", ownerId: "other", ownershipState: "FRONTIER" } as never);

    const added = applyAutoSettlementQueueFromServer(
      state,
      [
        { x: 9, y: 10 },
        { x: 30, y: 30 },
        { x: 40, y: 40 }
      ],
      { keyFor: (x, y) => `${x},${y}` }
    );

    expect(added).toBe(2);
    expect(state.developmentQueue).toEqual([
      { kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Settlement at (9, 10)" },
      { kind: "SETTLE", x: 30, y: 30, tileKey: "30,30", label: "Settlement at (30, 30)" }
    ]);
    expect(state.autoSettlementQueueVisibleUntilByTile.get("9,10")).toBeGreaterThan(Date.now());
  });

  it("does not re-add cancelled auto settlements", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    state.skippedAutoSettlementTileKeys.add("9,10");
    persistSkippedAutoSettlementTileKeysForPlayer("me", state.skippedAutoSettlementTileKeys);

    const added = applyAutoSettlementQueueFromServer(state, [{ x: 9, y: 10 }], { keyFor: (x, y) => `${x},${y}` });

    expect(added).toBe(0);
    expect(state.developmentQueue).toEqual([]);
  });

  it("marks cancelled auto-settlement queue entries as skipped", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.autoSettlementQueue = [{ x: 9, y: 10 }];
    state.developmentQueue = [{ kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Settlement at (9, 10)" }];

    const cancelled = cancelQueuedSettlement(state, "9,10", {
      pushFeed: () => {},
      renderHud: () => {}
    });

    expect(cancelled).toBe(true);
    expect(state.skippedAutoSettlementTileKeys.has("9,10")).toBe(true);
    expect(restoreSkippedAutoSettlementTileKeysForPlayer("me").has("9,10")).toBe(true);
  });

  it("manual settlement queueing clears a persisted auto-settle skip after refresh", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    persistSkippedAutoSettlementTileKeysForPlayer("me", new Set(["9,10"]));
    const state = createInitialState();
    state.me = "me";

    const queued = queueDevelopmentAction(state, { kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Settlement at (9, 10)" }, {
      pushFeed: () => {},
      renderHud: () => {}
    });

    expect(queued).toBe(true);
    expect(state.skippedAutoSettlementTileKeys.has("9,10")).toBe(false);
    expect(restoreSkippedAutoSettlementTileKeysForPlayer("me").has("9,10")).toBe(false);
  });

  it("keeps newly auto-queued settlements visible before dispatching them", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    state.authSessionReady = true;
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 0;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      applyAutoSettlementQueueFromServer(state, [{ x: 9, y: 10 }], { keyFor: (x, y) => `${x},${y}` });
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

      nowSpy.mockReturnValue(10_000 + AUTO_SETTLEMENT_QUEUE_VISIBLE_MS + 1);
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
      ).toBe(true);
      expect(requestSettlementSpy).toHaveBeenCalledTimes(1);
      expect(state.autoSettlementQueueVisibleUntilByTile.has("9,10")).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("prunes expired auto-settle visible holds even when the tile is not first in queue", () => {
    const state = createInitialState();
    state.developmentQueue = [
      { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Build at (1, 1)", payload: { type: "BUILD_STRUCTURE", x: 1, y: 1, structureType: "FORT" }, optimisticKind: "FORT" },
      { kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Settlement at (9, 10)" }
    ];
    state.autoSettlementQueueVisibleUntilByTile.set("9,10", 9_000);

    pruneExpiredAutoSettlementQueueVisibleHolds(state, 10_000);

    expect(state.autoSettlementQueueVisibleUntilByTile.has("9,10")).toBe(false);
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

  it("queues a fresh settlement behind existing queue entries even when a slot is free", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.developmentQueue = [{ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }];
    state.tiles.set("2,2", { x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as any);
    const sendGameMessage = vi.fn(() => true);

    const queued = requestSettlement(state, 2, 2, {
      keyFor: (x, y) => `${x},${y}`,
      developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
      developmentSlotReason: () => "busy",
      queueDevelopmentAction: (entry) => {
        state.developmentQueue.push(entry);
        return true;
      },
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendGameMessage,
      syncOptimisticSettlementTile: vi.fn(),
      opts: {}
    });

    expect(queued).toBe(true);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(state.developmentQueue.map((e) => e.tileKey)).toEqual(["1,1", "2,2"]);
  });

  it("forceQueue routes a settlement into the queue even with an empty queue and free slots", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.activeDevelopmentProcessCount = 0;
    state.tiles.set("2,2", { x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as any);
    const sendGameMessage = vi.fn(() => true);

    const queued = requestSettlement(state, 2, 2, {
      keyFor: (x, y) => `${x},${y}`,
      developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
      developmentSlotReason: () => "busy",
      queueDevelopmentAction: (entry) => {
        state.developmentQueue.push(entry);
        return true;
      },
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendGameMessage,
      syncOptimisticSettlementTile: vi.fn(),
      opts: { forceQueue: true }
    });

    expect(queued).toBe(true);
    // Bulk dispatch must not fire SETTLE directly; the queue dispatcher paces it.
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(state.settleProgressByTile.size).toBe(0);
    expect(state.developmentQueue.map((e) => e.tileKey)).toEqual(["2,2"]);
  });

  it("queues a granary behind existing queue entries even when a slot is free", () => {
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = [{ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }];
    const sendGameMessage = vi.fn(() => true);
    const optimistic = vi.fn();

    const queued = sendDevelopmentBuild(
      state,
      { type: "BUILD_STRUCTURE", x: 2, y: 2, structureType: "GRANARY" },
      optimistic,
      { x: 2, y: 2, label: "Granary at (2, 2)", optimisticKind: "GRANARY" },
      {
        keyFor: (x, y) => `${x},${y}`,
        queueDevelopmentAction: (entry) => {
          state.developmentQueue.push(entry);
          return true;
        },
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        developmentSlotReason: () => "busy",
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(queued).toBe(true);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(optimistic).not.toHaveBeenCalled();
    expect(state.developmentQueue.map((e) => `${e.kind}:${e.tileKey}`)).toEqual(["SETTLE:1,1", "BUILD:2,2"]);
  });

  it("sends fort builds with the currently supported gateway message", () => {
    const state = createInitialState();
    state.me = "me";
    const sendGameMessage = vi.fn(() => true);
    const optimistic = vi.fn();

    const sent = sendDevelopmentBuild(
      state,
      { type: "BUILD_STRUCTURE", x: 4, y: 5, structureType: "FORT" },
      optimistic,
      { x: 4, y: 5, label: "Fort at (4, 5)", optimisticKind: "FORT" },
      {
        keyFor: (x, y) => `${x},${y}`,
        queueDevelopmentAction: vi.fn(() => true),
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        developmentSlotReason: () => "busy",
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(sent).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "BUILD_FORT", x: 4, y: 5 });
    expect(state.lastDevelopmentAttempt).toMatchObject({
      payload: { type: "BUILD_STRUCTURE", x: 4, y: 5, structureType: "FORT" }
    });
    expect(optimistic).toHaveBeenCalledTimes(1);
  });

  it("sends economic builds with the currently supported gateway message", () => {
    const state = createInitialState();
    state.me = "me";
    const sendGameMessage = vi.fn(() => true);
    const optimistic = vi.fn();

    const sent = sendDevelopmentBuild(
      state,
      { type: "BUILD_STRUCTURE", x: 6, y: 7, structureType: "MARKET" },
      optimistic,
      { x: 6, y: 7, label: "Market at (6, 7)", optimisticKind: "MARKET" },
      {
        keyFor: (x, y) => `${x},${y}`,
        queueDevelopmentAction: vi.fn(() => true),
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        developmentSlotReason: () => "busy",
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(sent).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "BUILD_ECONOMIC_STRUCTURE", x: 6, y: 7, structureType: "MARKET" });
    expect(state.lastDevelopmentAttempt).toMatchObject({
      payload: { type: "BUILD_STRUCTURE", x: 6, y: 7, structureType: "MARKET" }
    });
    expect(optimistic).toHaveBeenCalledTimes(1);
  });

  it("uses settlement speed effects for optimistic settlement progress", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.techIds = ["toolmaking"];
    state.techCatalog = [
      {
        id: "toolmaking",
        name: "Workshop Standards",
        tier: 1,
        description: "Faster settlement.",
        mods: {},
        effects: { settlementSpeedMult: 1.05 },
        requirements: { gold: 0, resources: {} }
      } satisfies TechInfo
    ];
    state.tiles.set("2,2", {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } as any);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      const sent = requestSettlement(state, 2, 2, {
        keyFor: (x, y) => `${x},${y}`,
        developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
        developmentSlotReason: () => "busy",
        queueDevelopmentAction: vi.fn(() => false),
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage: vi.fn(() => true),
        syncOptimisticSettlementTile: vi.fn(),
        opts: {}
      });

      expect(sent).toBe(true);
      expect(state.settleProgressByTile.get("2,2")).toEqual(
        expect.objectContaining({
          startAt: 10_000,
          resolvesAt: 10_000 + Math.round(60_000 / 1.05),
          target: { x: 2, y: 2 }
        })
      );
    } finally {
      nowSpy.mockRestore();
    }
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

  it("round-trips a fresh BUILD_STRUCTURE entry preserving structureType after reload", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    persistDevelopmentQueueForPlayer("me", [
      {
        kind: "BUILD",
        x: 3,
        y: 4,
        tileKey: "3,4",
        label: "Market at (3, 4)",
        payload: { type: "BUILD_STRUCTURE", x: 3, y: 4, structureType: "MARKET" },
        optimisticKind: "MARKET"
      }
    ]);

    const restored = restorePersistedDevelopmentQueueForPlayer(
      "me",
      new Map([["3,4", { ownerId: "me", ownershipState: "SETTLED" }]])
    );

    expect(restored).toEqual([
      {
        kind: "BUILD",
        x: 3,
        y: 4,
        tileKey: "3,4",
        label: "Market at (3, 4)",
        payload: { type: "BUILD_STRUCTURE", x: 3, y: 4, structureType: "MARKET" },
        optimisticKind: "MARKET"
      }
    ]);
  });

  it("migrates a legacy BUILD_FORT entry to BUILD_STRUCTURE with structureType FORT", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    // Simulate what an old client persisted (raw BUILD_FORT, no structureType field).
    globalThis.sessionStorage.setItem(
      "border-empires-development-queue-v1",
      JSON.stringify({
        playerId: "me",
        queue: [
          {
            kind: "BUILD",
            x: 5,
            y: 6,
            tileKey: "5,6",
            label: "Fort at (5, 6)",
            payload: { type: "BUILD_FORT", x: 5, y: 6 },
            optimisticKind: "FORT"
          }
        ]
      })
    );

    const restored = restorePersistedDevelopmentQueueForPlayer(
      "me",
      new Map([["5,6", { ownerId: "me", ownershipState: "SETTLED" }]])
    );

    expect(restored).toEqual([
      {
        kind: "BUILD",
        x: 5,
        y: 6,
        tileKey: "5,6",
        label: "Fort at (5, 6)",
        payload: { type: "BUILD_STRUCTURE", x: 5, y: 6, structureType: "FORT" },
        optimisticKind: "FORT"
      }
    ]);
  });

  it("migrates a legacy BUILD_ECONOMIC_STRUCTURE entry to BUILD_STRUCTURE preserving structureType", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    // Simulate what an old client persisted (BUILD_ECONOMIC_STRUCTURE with structureType).
    globalThis.sessionStorage.setItem(
      "border-empires-development-queue-v1",
      JSON.stringify({
        playerId: "me",
        queue: [
          {
            kind: "BUILD",
            x: 7,
            y: 8,
            tileKey: "7,8",
            label: "Granary at (7, 8)",
            payload: { type: "BUILD_ECONOMIC_STRUCTURE", x: 7, y: 8, structureType: "GRANARY" },
            optimisticKind: "GRANARY"
          }
        ]
      })
    );

    const restored = restorePersistedDevelopmentQueueForPlayer(
      "me",
      new Map([["7,8", { ownerId: "me", ownershipState: "SETTLED" }]])
    );

    expect(restored).toEqual([
      {
        kind: "BUILD",
        x: 7,
        y: 8,
        tileKey: "7,8",
        label: "Granary at (7, 8)",
        payload: { type: "BUILD_STRUCTURE", x: 7, y: 8, structureType: "GRANARY" },
        optimisticKind: "GRANARY"
      }
    ]);
  });
});
