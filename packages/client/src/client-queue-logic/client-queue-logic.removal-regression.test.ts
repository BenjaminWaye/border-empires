import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { processDevelopmentQueue, sendDevelopmentBuild } from "./client-queue-logic.js";

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

describe("structure removal dispatch", () => {
  it("sends structure removals with the currently supported gateway message", () => {
    const state = createInitialState();
    state.me = "me";
    const sendGameMessage = vi.fn(() => true);
    const optimistic = vi.fn();

    const sent = sendDevelopmentBuild(
      state,
      { type: "REMOVE_STRUCTURE", x: 8, y: 9 },
      optimistic,
      { x: 8, y: 9, label: "Remove Fort at (8, 9)", optimisticKind: "FORT" },
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
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "REMOVE_STRUCTURE", x: 8, y: 9 });
    expect(state.lastDevelopmentAttempt).toMatchObject({
      payload: { type: "REMOVE_STRUCTURE", x: 8, y: 9 }
    });
    expect(optimistic).toHaveBeenCalledTimes(1);
  });

  it("dispatches a queued REMOVE_STRUCTURE through processDevelopmentQueue and applies optimistic removal", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.authSessionReady = true;
    state.developmentProcessLimit = 4;
    state.activeDevelopmentProcessCount = 0;
    state.developmentQueue = [
      { kind: "BUILD", x: 3, y: 3, tileKey: "3,3", label: "Remove Observatory at (3, 3)", payload: { type: "REMOVE_STRUCTURE", x: 3, y: 3 }, optimisticKind: "OBSERVATORY" }
    ];
    const ws = { readyState: 1, OPEN: 1 } as unknown as import("../client-socket-types.js").RealtimeSocket;
    const sendDevelopmentBuild = vi.fn((_payload: unknown, _optimistic: () => void) => true);
    const applyOptimisticStructureBuild = vi.fn();
    const applyOptimisticStructureRemoval = vi.fn();

    const started = processDevelopmentQueue(state, {
      ws,
      authSessionReady: true,
      developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
      requestSettlement: vi.fn(() => true),
      sendDevelopmentBuild,
      applyOptimisticStructureBuild,
      applyOptimisticStructureRemoval,
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(true);
    expect(sendDevelopmentBuild).toHaveBeenCalledTimes(1);
    const optimisticFn = sendDevelopmentBuild.mock.calls[0]![1] as () => void;
    optimisticFn();
    expect(applyOptimisticStructureRemoval).toHaveBeenCalledWith(3, 3);
    expect(applyOptimisticStructureBuild).not.toHaveBeenCalled();
    expect(state.developmentQueue).toHaveLength(0);
  });
});
