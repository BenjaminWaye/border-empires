import { describe, expect, it, vi } from "vitest";
import { SETTLE_MANPOWER_COST } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";
import { processDevelopmentQueue, queuedSettleAwaitsManpower, requestSettlement } from "./client-development-dispatch.js";

const frontierTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER" });
const ws = { readyState: 1, OPEN: 1 } as unknown as RealtimeSocket;

const makeState = (manpower: number) => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 999;
  state.manpower = manpower;
  state.tiles.set("1,1", frontierTile(1, 1));
  state.tiles.set("2,2", frontierTile(2, 2));
  return state;
};

const processDeps = (requestSettlementSpy: ReturnType<typeof vi.fn>, sendDevelopmentBuild = vi.fn(() => true), sendGameMessage = vi.fn(() => true)) => ({
  ws,
  authSessionReady: true,
  developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
  requestSettlement: requestSettlementSpy,
  sendDevelopmentBuild,
  applyOptimisticStructureBuild: vi.fn(),
  applyOptimisticStructureRemoval: vi.fn(),
  pushFeed: vi.fn(),
  renderHud: vi.fn(),
  sendGameMessage
});

describe("queued garrisons wait for manpower instead of failing", () => {
  // Regression: a queued garrison whose turn came up while manpower was short
  // was handed to requestSettlement, refused, and silently dropped from the queue.
  it("keeps a garrison the pool can't cover in the queue, untouched, while a build behind it goes", () => {
    const state = makeState(SETTLE_MANPOWER_COST - 1);
    state.developmentQueue = [
      { kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Garrison at (1, 1)" },
      { kind: "BUILD", x: 2, y: 2, tileKey: "2,2", label: "Build Fort at (2, 2)", payload: { type: "BUILD_STRUCTURE", x: 2, y: 2, structureType: "FORT" }, optimisticKind: "FORT" }
    ];
    const requestSettlementSpy = vi.fn(() => true);
    const sendDevelopmentBuild = vi.fn(() => true);
    const sendGameMessage = vi.fn(() => true);

    expect(processDevelopmentQueue(state, processDeps(requestSettlementSpy, sendDevelopmentBuild, sendGameMessage))).toBe(true);
    expect(requestSettlementSpy).not.toHaveBeenCalled();
    expect(sendDevelopmentBuild).toHaveBeenCalledOnce();
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["1,1"]);
    // Only the dispatched build is pulled out of the server mirror.
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_CANCEL", tileKey: "2,2" });
    expect(sendGameMessage).not.toHaveBeenCalledWith({ type: "DEV_QUEUE_CANCEL", tileKey: "1,1" });
  });

  it("dispatches the waiting garrison once manpower arrives", () => {
    const state = makeState(0);
    state.developmentQueue = [{ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Garrison at (1, 1)" }];
    const requestSettlementSpy = vi.fn(() => true);
    expect(processDevelopmentQueue(state, processDeps(requestSettlementSpy))).toBe(false);
    expect(state.developmentQueue).toHaveLength(1);

    state.manpower = SETTLE_MANPOWER_COST;
    expect(processDevelopmentQueue(state, processDeps(requestSettlementSpy))).toBe(true);
    expect(requestSettlementSpy).toHaveBeenCalledWith(1, 1, expect.objectContaining({ fromQueue: true, manpowerReserved: false }));
    expect(state.developmentQueue).toEqual([]);
  });

  it("dispatches a garrison the server already holds manpower for, even though the local pool shows less", () => {
    const state = makeState(0);
    state.devQueueManpowerReservedTileKeys = new Set(["1,1"]);
    state.developmentQueue = [{ kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Garrison at (1, 1)" }];
    expect(queuedSettleAwaitsManpower(state, "1,1")).toBe(false);
    const requestSettlementSpy = vi.fn(() => true);
    expect(processDevelopmentQueue(state, processDeps(requestSettlementSpy))).toBe(true);
    expect(requestSettlementSpy).toHaveBeenCalledWith(1, 1, expect.objectContaining({ manpowerReserved: true }));
    expect(state.devQueueManpowerReservedTileKeys.has("1,1")).toBe(false);
  });
});

describe("requestSettlement while short on manpower", () => {
  const settleDeps = (state: ReturnType<typeof makeState>, opts?: Parameters<typeof requestSettlement>[3]["opts"]) => {
    const sendGameMessage = vi.fn(() => true);
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    return {
      sendGameMessage,
      pushFeed,
      deps: {
        keyFor: (x: number, y: number) => `${x},${y}`,
        renderHud,
        pushFeed,
        showCaptureAlert: vi.fn(),
        developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
        developmentSlotReason: () => "Busy",
        sendGameMessage,
        syncOptimisticSettlementTile: vi.fn(),
        queueDevelopmentAction: (entry: Parameters<typeof queueDevelopmentAction>[1]) => queueDevelopmentAction(state, entry, { renderHud, sendGameMessage, pushFeed }),
        ...(opts ? { opts } : {})
      }
    };
  };

  it("queues the garrison to wait for the next batch instead of refusing it", () => {
    const state = makeState(SETTLE_MANPOWER_COST - 1);
    const { deps, sendGameMessage, pushFeed } = settleDeps(state);
    expect(requestSettlement(state, 1, 1, deps)).toBe(true);
    expect(state.developmentQueue).toEqual([expect.objectContaining({ kind: "SETTLE", tileKey: "1,1" })]);
    expect(sendGameMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "DEV_QUEUE_ENQUEUE", tileKey: "1,1", kind: "SETTLE" }));
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SETTLE" }));
    expect(pushFeed).toHaveBeenCalledWith("Garrison queued: waiting for manpower.", "combat", "info");
    expect(state.manpower).toBe(SETTLE_MANPOWER_COST - 1);
  });

  it("still refuses when queueing isn't allowed", () => {
    const state = makeState(0);
    const { deps } = settleDeps(state, { allowQueueWhenBusy: false, fromQueue: true, suppressWarnings: true });
    expect(requestSettlement(state, 1, 1, deps)).toBe(false);
    expect(state.developmentQueue).toEqual([]);
  });

  it("sends a reserved queued garrison without debiting the local pool again", () => {
    const state = makeState(3);
    const { deps, sendGameMessage } = settleDeps(state, { allowQueueWhenBusy: false, fromQueue: true, suppressWarnings: true, manpowerReserved: true });
    expect(requestSettlement(state, 1, 1, deps)).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SETTLE", x: 1, y: 1 });
    expect(state.manpower).toBe(3);
  });
});
