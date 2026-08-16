import { describe, expect, it, vi } from "vitest";
import { DEV_QUEUE_SERVER_CAP, DEV_QUEUE_TOTAL_CAP } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import {
  devQueueCancelWirePayload,
  devQueueEnqueueWirePayload,
  devQueueMoveToFrontWirePayload,
  isQueuedDevelopmentActionStillValid,
  mergeServerDevQueueIntoRestoredQueue
} from "./client-development-queue.js";
import { queueDevelopmentAction, cancelQueuedSettlement, moveQueuedEntryToFront } from "../client-queue-logic/client-queue-logic.js";

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

describe("dev queue wire payloads", () => {
  it("builds a DEV_QUEUE_ENQUEUE payload for a SETTLE entry", () => {
    expect(devQueueEnqueueWirePayload({ kind: "SETTLE", x: 2, y: 3, tileKey: "2,3", label: "Settlement at (2, 3)" })).toEqual({
      type: "DEV_QUEUE_ENQUEUE",
      x: 2,
      y: 3,
      tileKey: "2,3",
      kind: "SETTLE"
    });
  });

  it("builds a DEV_QUEUE_ENQUEUE payload for a BUILD entry, carrying structureType", () => {
    expect(
      devQueueEnqueueWirePayload({
        kind: "BUILD",
        x: 4,
        y: 5,
        tileKey: "4,5",
        label: "Build Fort",
        payload: { type: "BUILD_STRUCTURE", x: 4, y: 5, structureType: "FORT" },
        optimisticKind: "FORT"
      })
    ).toEqual({ type: "DEV_QUEUE_ENQUEUE", x: 4, y: 5, tileKey: "4,5", kind: "BUILD", structureType: "FORT" });
  });

  it("uses the REMOVE_STRUCTURE sentinel for a removal entry", () => {
    expect(
      devQueueEnqueueWirePayload({
        kind: "BUILD",
        x: 4,
        y: 5,
        tileKey: "4,5",
        label: "Remove structure",
        payload: { type: "REMOVE_STRUCTURE", x: 4, y: 5 },
        optimisticKind: "FORT"
      })
    ).toEqual({ type: "DEV_QUEUE_ENQUEUE", x: 4, y: 5, tileKey: "4,5", kind: "BUILD", structureType: "REMOVE_STRUCTURE" });
  });

  it("builds cancel/move-to-front payloads keyed only by tileKey", () => {
    expect(devQueueCancelWirePayload("4,5")).toEqual({ type: "DEV_QUEUE_CANCEL", tileKey: "4,5" });
    expect(devQueueMoveToFrontWirePayload("4,5")).toEqual({ type: "DEV_QUEUE_MOVE_TO_FRONT", tileKey: "4,5" });
  });
});

describe("queueDevelopmentAction: server mirroring", () => {
  it("mirrors an entry landing within the durable tier to the server", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    const sendGameMessage = vi.fn(() => true);

    queueDevelopmentAction(state, { kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }, {
      pushFeed: () => {},
      renderHud: () => {},
      sendGameMessage
    });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_ENQUEUE", x: 1, y: 1, tileKey: "1,1", kind: "SETTLE" });
  });

  it("does not mirror an entry landing beyond the durable tier (planned tier)", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = Array.from({ length: DEV_QUEUE_SERVER_CAP }, (_, i) => ({
      kind: "SETTLE" as const,
      x: i,
      y: 0,
      tileKey: `${i},0`,
      label: `Settlement at (${i}, 0)`
    }));
    const sendGameMessage = vi.fn(() => true);

    queueDevelopmentAction(state, { kind: "SETTLE", x: 999, y: 0, tileKey: "999,0", label: "Settlement at (999, 0)" }, {
      pushFeed: () => {},
      renderHud: () => {},
      sendGameMessage
    });

    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("works without a sendGameMessage dep (optional)", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    const queued = queueDevelopmentAction(state, { kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }, {
      pushFeed: () => {},
      renderHud: () => {}
    });
    expect(queued).toBe(true);
  });
});

describe("cancelQueuedSettlement / moveQueuedEntryToFront: server mirroring", () => {
  it("sends DEV_QUEUE_CANCEL when a queued settlement is cancelled", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = [{ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }];
    const sendGameMessage = vi.fn(() => true);

    cancelQueuedSettlement(state, "1,1", { pushFeed: () => {}, renderHud: () => {}, sendGameMessage });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_CANCEL", tileKey: "1,1" });
  });

  it("sends DEV_QUEUE_MOVE_TO_FRONT when a queued entry is promoted", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = [
      { kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" },
      { kind: "SETTLE", x: 2, y: 2, tileKey: "2,2", label: "Settlement at (2, 2)" }
    ];
    const sendGameMessage = vi.fn(() => true);

    moveQueuedEntryToFront(state, "2,2", { pushFeed: () => {}, renderHud: () => {}, sendGameMessage });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_MOVE_TO_FRONT", tileKey: "2,2" });
  });
});

describe("mergeServerDevQueueIntoRestoredQueue", () => {
  it("returns the restored queue unchanged when there is no server queue", () => {
    const restored = [{ kind: "SETTLE" as const, x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }];
    expect(mergeServerDevQueueIntoRestoredQueue(restored, undefined)).toEqual(restored);
  });

  it("orders server-known entries first, reusing rich local data when available", () => {
    const restored = [
      { kind: "SETTLE" as const, x: 9, y: 9, tileKey: "9,9", label: "Settlement at (9, 9)" },
      { kind: "SETTLE" as const, x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }
    ];
    const merged = mergeServerDevQueueIntoRestoredQueue(restored, [{ tileKey: "1,1", x: 1, y: 1, kind: "SETTLE", queuedAt: 1 }]);
    expect(merged.map((e) => e.tileKey)).toEqual(["1,1", "9,9"]);
    // Reused the richer locally-known label rather than a synthesized one.
    expect(merged[0]).toEqual(restored[1]);
  });

  it("reconstructs an entry the server knows about but sessionStorage doesn't", () => {
    const merged = mergeServerDevQueueIntoRestoredQueue([], [{ tileKey: "3,3", x: 3, y: 3, kind: "BUILD", structureType: "FORT", queuedAt: 1 }]);
    expect(merged).toEqual([
      {
        kind: "BUILD",
        x: 3,
        y: 3,
        tileKey: "3,3",
        label: "Build FORT at (3, 3)",
        payload: { type: "BUILD_STRUCTURE", x: 3, y: 3, structureType: "FORT" },
        optimisticKind: "FORT"
      }
    ]);
  });

  it("caps the merged queue implicitly at the server's own cap plus overflow, never dropping local-only planned entries", () => {
    const restored = [{ kind: "SETTLE" as const, x: 50, y: 50, tileKey: "50,50", label: "Settlement at (50, 50)" }];
    const serverQueue = Array.from({ length: DEV_QUEUE_SERVER_CAP }, (_, i) => ({
      tileKey: `${i},0`,
      x: i,
      y: 0,
      kind: "SETTLE" as const,
      queuedAt: i
    }));
    const merged = mergeServerDevQueueIntoRestoredQueue(restored, serverQueue);
    expect(merged).toHaveLength(DEV_QUEUE_SERVER_CAP + 1);
    expect(merged[merged.length - 1]).toEqual(restored[0]);
    expect(merged.length).toBeLessThanOrEqual(DEV_QUEUE_TOTAL_CAP);
  });
});

describe("isQueuedDevelopmentActionStillValid", () => {
  // A locally-known entry that's absent from a reconnect's serverDevQueue
  // isn't necessarily unmirrored -- the server's own auto-drain may have
  // already resolved it while this client was offline. This is the tile-state
  // check the INIT handler re-runs post-merge to catch that case.
  it("is false once a SETTLE's tile already settled (server drained it while offline)", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const }]]);
    expect(isQueuedDevelopmentActionStillValid({ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }, tiles, "me")).toBe(false);
  });

  it("is true while a SETTLE's tile is still an unclaimed frontier tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "FRONTIER" as const }]]);
    expect(isQueuedDevelopmentActionStillValid({ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }, tiles, "me")).toBe(true);
  });

  it("is false once ownership of the tile has changed", () => {
    const tiles = new Map([["1,1", { ownerId: "someone-else", ownershipState: "FRONTIER" as const }]]);
    expect(isQueuedDevelopmentActionStillValid({ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Settlement at (1, 1)" }, tiles, "me")).toBe(false);
  });

  it("is true for a BUILD entry on an owned, settled tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const }]]);
    expect(
      isQueuedDevelopmentActionStillValid(
        { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Build Fort", payload: { type: "BUILD_STRUCTURE", x: 1, y: 1, structureType: "FORT" }, optimisticKind: "FORT" },
        tiles,
        "me"
      )
    ).toBe(true);
  });

  // Regression for a repeating BUILD_INVALID "tile already has structure" loop
  // (see 2026-08-16 debug bundle): a dev-queue BUILD entry can survive on the
  // server's durable mirror after the client already dispatched it and moved
  // on (e.g. the DEV_QUEUE_CANCEL that should have cleared it got dropped).
  // Once the structure actually exists on the tile, redispatching that ghost
  // entry is never valid again, regardless of ownership/settlement state.
  it("is false for a BUILD entry once the requested structure already exists on the tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const, fort: { status: "active" } }]]);
    expect(
      isQueuedDevelopmentActionStillValid(
        { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Build Fort", payload: { type: "BUILD_STRUCTURE", x: 1, y: 1, structureType: "FORT" }, optimisticKind: "FORT" },
        tiles,
        "me"
      )
    ).toBe(false);
  });

  it("is false for a BUILD entry once the requested economic structure already exists on the tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const, economicStructure: { type: "GRANARY", status: "active" } }]]);
    expect(
      isQueuedDevelopmentActionStillValid(
        { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Build Granary", payload: { type: "BUILD_STRUCTURE", x: 1, y: 1, structureType: "GRANARY" }, optimisticKind: "GRANARY" as any },
        tiles,
        "me"
      )
    ).toBe(false);
  });

  it("is true for a BUILD entry when a different economic structure exists on the tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const, economicStructure: { type: "GRANARY", status: "active" } }]]);
    expect(
      isQueuedDevelopmentActionStillValid(
        { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Build Mine", payload: { type: "BUILD_STRUCTURE", x: 1, y: 1, structureType: "MINE" }, optimisticKind: "MINE" as any },
        tiles,
        "me"
      )
    ).toBe(true);
  });

  it("is true for a REMOVE_STRUCTURE entry on an owned, settled tile", () => {
    const tiles = new Map([["1,1", { ownerId: "me", ownershipState: "SETTLED" as const, fort: { status: "active" } }]]);
    expect(
      isQueuedDevelopmentActionStillValid(
        { kind: "BUILD", x: 1, y: 1, tileKey: "1,1", label: "Remove structure", payload: { type: "REMOVE_STRUCTURE", x: 1, y: 1 }, optimisticKind: "FORT" },
        tiles,
        "me"
      )
    ).toBe(true);
  });
});
