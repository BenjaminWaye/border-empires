import { describe, expect, it, vi } from "vitest";
import { DEV_QUEUE_TOTAL_CAP } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { queueDevelopmentAction } from "../client-queue-logic/client-queue-logic.js";

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

describe("development queue: total cap", () => {
  it("rejects queueing once the queue is at the total (server + planned) cap", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = Array.from({ length: DEV_QUEUE_TOTAL_CAP }, (_, i) => ({
      kind: "SETTLE" as const,
      x: i,
      y: 0,
      tileKey: `${i},0`,
      label: `Settlement at (${i}, 0)`
    }));
    const pushFeed = vi.fn();

    const queued = queueDevelopmentAction(state, { kind: "SETTLE", x: 999, y: 0, tileKey: "999,0", label: "Settlement at (999, 0)" }, {
      pushFeed,
      renderHud: () => {}
    });

    expect(queued).toBe(false);
    expect(state.developmentQueue).toHaveLength(DEV_QUEUE_TOTAL_CAP);
    expect(pushFeed).not.toHaveBeenCalled();
  });

  it("allows queueing again once below the total cap", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = Array.from({ length: DEV_QUEUE_TOTAL_CAP - 1 }, (_, i) => ({
      kind: "SETTLE" as const,
      x: i,
      y: 0,
      tileKey: `${i},0`,
      label: `Settlement at (${i}, 0)`
    }));

    const queued = queueDevelopmentAction(state, { kind: "SETTLE", x: 999, y: 0, tileKey: "999,0", label: "Settlement at (999, 0)" }, {
      pushFeed: () => {},
      renderHud: () => {}
    });

    expect(queued).toBe(true);
    expect(state.developmentQueue).toHaveLength(DEV_QUEUE_TOTAL_CAP);
  });
});
