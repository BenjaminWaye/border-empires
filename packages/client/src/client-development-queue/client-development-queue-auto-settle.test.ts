import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { AUTO_SETTLEMENT_QUEUE_VISIBLE_MS, applyAutoSettlementQueueFromServer } from "./client-development-queue.js";
import { processDevelopmentQueue } from "../client-queue-logic/client-queue-logic.js";

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

describe("auto-settled development queue entries", () => {
  it("appends server-ordered auto settlements to the cancellable development queue", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ ...DEFAULT_AUTO_SETTLE_PREFS });
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
      { kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Garrison at (9, 10)" },
      { kind: "SETTLE", x: 30, y: 30, tileKey: "30,30", label: "Garrison at (30, 30)" }
    ]);
    expect(state.autoSettlementQueueVisibleUntilByTile.get("9,10")).toBeGreaterThan(Date.now());
  });

  it("keeps newly auto-queued settlements visible before dispatching them", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.autoSettle = loadedAutoSettleState({ ...DEFAULT_AUTO_SETTLE_PREFS });
    state.gold = 1_000;
    state.authSessionReady = true;
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 0;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      applyAutoSettlementQueueFromServer(state, [{ x: 9, y: 10 }], { keyFor: (x, y) => `${x},${y}` });
      const requestSettlementSpy = vi.fn(() => true);
      const ws = { readyState: 1, OPEN: 1 } as unknown as import("../client-socket-types.js").RealtimeSocket;

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
});
